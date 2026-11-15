// Hardware scraper admin routes. The design is in docs/scraper-design.md.
//
// Every route in this file is called with the admin key already checked. The
// scraper runner, the enrichment drainer on the always-on host and the review
// screen all use the same `x-admin-key` header.
//
// The pure rules live in scraper/rules.ts so the runner and the Worker use
// one copy. They are re-exported here because the Worker tests import them
// from this file.

import {
  buildDescription,
  isCandidateStatus,
  isOfferStatus,
  isReasonCode,
  isTrustTier,
  missingSpecs,
  NOT_FOUND_STRIKES,
  offerId,
  UNVERIFIED_AFTER_DAYS,
} from '../scraper/rules.ts';

export {
  CANDIDATE_STATUSES,
  OFFER_STATUSES,
  REASON_CODES,
  TRUST_TIERS,
  buildDescription,
  isCandidateStatus,
  isOfferStatus,
  isReasonCode,
  isTrustTier,
  medianPrice,
  offerId,
  withinBand,
} from '../scraper/rules.ts';

export type { CandidateStatus, MedianResult, OfferStatus, PriceInput, TrustTier } from '../scraper/rules.ts';

type ScraperEnv = {
  DB: D1Database;
  KAPSO_API_KEY?: string;
  KAPSO_PHONE_NUMBER_ID?: string;
  KAPSO_ALERT_TO?: string;
  KAPSO_TEMPLATE_NAME?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const badRequest = (message: string) => json({ error: message }, 400);

// A failed image is tried again after a wait, up to this many attempts. A
// row that used them all stays failed until a human looks at it.
export const MAX_QUEUE_ATTEMPTS = 3;
export const QUEUE_RETRY_WAIT_MINUTES = 15;

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const ENRICHMENT_NUMERIC_FIELDS = new Set([
  'watts',
  'voc',
  'isc',
  'voltage_v',
  'capacity_ah',
  'capacity_kwh',
  'efficiency_pct',
]);
const ENRICHMENT_TEXT_FIELDS = new Set(['battery_type', 'cell_type']);

export function validateEnrichmentResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The enrichment result must be one JSON object.');
  }
  const result: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!ENRICHMENT_NUMERIC_FIELDS.has(field) && !ENRICHMENT_TEXT_FIELDS.has(field)) {
      throw new Error(`The enrichment result has an unknown field: ${field}`);
    }
    if (raw === null || raw === undefined) continue;
    if (ENRICHMENT_NUMERIC_FIELDS.has(field)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw new Error(`The enrichment field ${field} must be a positive number.`);
      }
      result[field] = raw;
      continue;
    }
    if (typeof raw !== 'string' || raw.length > 200) {
      throw new Error(`The enrichment field ${field} must be short text.`);
    }
    if (field === 'battery_type' && !['lithium', 'lead-acid'].includes(raw)) {
      throw new Error('The enrichment field battery_type must be lithium or lead-acid.');
    }
    result[field] = raw;
  }
  return result;
}

async function applyEnrichmentToHashes(
  db: D1Database,
  specsByHash: Map<string, Record<string, unknown>>,
): Promise<void> {
  const hashes = [...specsByHash.keys()];
  if (hashes.length === 0) return;
  const placeholders = hashes.map(() => '?').join(',');
  const offers = await db
    .prepare(
      `SELECT id, image_hash, stated_specs, trading_signals
       FROM hardware_offers WHERE image_hash IN (${placeholders})`,
    )
    .bind(...hashes)
    .all<{
      id: string;
      image_hash: string;
      stated_specs: string;
      trading_signals: string;
    }>();
  const statements = (offers.results ?? []).map((offer) => {
    const specs = specsByHash.get(offer.image_hash) ?? {};
    const known = parseJson(offer.stated_specs) as Record<string, unknown>;
    const signals = parseJson(offer.trading_signals) as Record<string, unknown>;
    const fieldSources =
      signals.spec_sources && typeof signals.spec_sources === 'object'
        ? (signals.spec_sources as Record<string, unknown>)
        : {};
    const merged = { ...known };
    for (const [field, value] of Object.entries(specs)) {
      if (merged[field] === undefined || merged[field] === null || merged[field] === '') {
        merged[field] = value;
        fieldSources[field] = 'image_enrichment';
      }
    }
    const enrichmentSpecs =
      signals.enrichment_specs && typeof signals.enrichment_specs === 'object'
        ? (signals.enrichment_specs as Record<string, unknown>)
        : {};
    return db
      .prepare(
        `UPDATE hardware_offers
         SET stated_specs = ?, trading_signals = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        JSON.stringify(merged),
        JSON.stringify({
          ...signals,
          spec_sources: fieldSources,
          enrichment_specs: { ...enrichmentSpecs, ...specs },
        }),
        offer.id,
      );
  });
  if (statements.length > 0) await db.batch(statements);
}

async function applyEnrichmentToHash(
  db: D1Database,
  imageHash: string,
  specs: Record<string, unknown>,
): Promise<void> {
  await applyEnrichmentToHashes(db, new Map([[imageHash, specs]]));
}

type PublishSupport = {
  status: string;
  in_stock: string;
  unit_basis: string | null;
  condition: string;
  price: number | null;
  last_checked: string | null;
};

export function isQualifiedPublishSupport(
  offer: PublishSupport,
  now = Date.now(),
): boolean {
  if (offer.status !== 'qualified' || offer.in_stock !== 'true') return false;
  if (offer.unit_basis !== 'piece' && offer.unit_basis !== 'derived') return false;
  if (['used', 'foreign_used', 'refurbished', 'open_box'].includes(offer.condition)) return false;
  if (typeof offer.price !== 'number' || offer.price <= 0) return false;
  const checked = Date.parse(offer.last_checked ?? '');
  if (Number.isNaN(checked)) return false;
  const age = now - checked;
  return age >= -24 * 60 * 60 * 1000 && age <= UNVERIFIED_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export async function handleScraperRoute(
  request: Request,
  env: ScraperEnv,
  pathname: string,
  method: string,
): Promise<Response | null> {
  if (pathname === '/api/scraper/run' && method === 'POST') {
    const body = await readBody(request);
    const runId = text(body.run_id) || crypto.randomUUID();
    const kind = text(body.kind, 'sweep');
    const status = text(body.status, 'ok');
    const sources = Array.isArray(body.sources) ? body.sources.map((source) => text(source)) : [];
    const startedAt = text(body.started_at, new Date().toISOString());
    const finishedAt = text(body.finished_at, new Date().toISOString());

    await env.DB
      .prepare(
        `INSERT INTO run_report (run_id, kind, status, sources, report, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           kind = excluded.kind,
           status = excluded.status,
           sources = excluded.sources,
           report = excluded.report,
           finished_at = excluded.finished_at`,
      )
      .bind(
        runId,
        kind,
        status,
        JSON.stringify(sources),
        JSON.stringify(body.report ?? {}),
        startedAt,
        finishedAt,
      )
      .run();

    // The watchdog reads the heartbeat. A failed run leaves the old heartbeat
    // in place, so the watchdog fires.
    if (status === 'ok' || status === 'partial') {
      await env.DB
        .prepare(
          `INSERT INTO settings (key, value, updated_at)
           VALUES ('scraper_heartbeat', ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = datetime('now')`,
        )
        .bind(JSON.stringify({ run_id: runId, at: finishedAt, status }))
        .run();
    }

    return json({ run_id: runId, status: 'ok' });
  }

  if (pathname === '/api/scraper/runs' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10) || 10, 100);
    const kind = url.searchParams.get('kind');

    // The watchdog reads the last runs to see whether the heartbeat is fresh.
    const rows = kind
      ? await env.DB
          .prepare('SELECT * FROM run_report WHERE kind = ? ORDER BY finished_at DESC LIMIT ?')
          .bind(kind, limit)
          .all<Record<string, unknown>>()
      : await env.DB
          .prepare('SELECT * FROM run_report ORDER BY finished_at DESC LIMIT ?')
          .bind(limit)
          .all<Record<string, unknown>>();

    const heartbeat = await env.DB
      .prepare("SELECT value, updated_at FROM settings WHERE key = 'scraper_heartbeat'")
      .first<{ value: string | null; updated_at: string | null }>();

    return json({
      runs: (rows.results ?? []).map((row) => ({
        ...row,
        sources: parseJson(row.sources),
        report: parseJson(row.report),
      })),
      heartbeat: heartbeat?.value ? parseJson(heartbeat.value) : null,
      heartbeat_at: heartbeat?.updated_at ?? null,
    });
  }

  if (pathname === '/api/scraper/alert' && method === 'POST') {
    const body = await readBody(request);
    const message = text(body.message, 'Solar Sizer scraper alert');

    const apiKey = env.KAPSO_API_KEY;
    const phoneNumberId = env.KAPSO_PHONE_NUMBER_ID;
    const to = env.KAPSO_ALERT_TO;
    const template = env.KAPSO_TEMPLATE_NAME;
    if (!apiKey || !phoneNumberId || !to) {
      return json({ error: 'The WhatsApp alert is not configured on this Worker.' }, 503);
    }

    // The Kapso proxy speaks the Meta WhatsApp message shape. An approved
    // template needs a production number. The Kapso sandbox number cannot
    // send templates, so a missing template name sends plain text.
    const payload = template
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', parameter_name: 'message', text: message }],
              },
            ],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } };

    const response = await fetch(`https://api.kapso.ai/meta/whatsapp/v23.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const result = await response.text();
    if (!response.ok) {
      return json({ error: 'Kapso refused the message.', detail: result.slice(0, 300) }, 502);
    }
    return json({ success: true, detail: result.slice(0, 300) });
  }

  if (pathname === '/api/scraper/offers/purge' && method === 'POST') {
    const result = await env.DB
      .prepare(
        `UPDATE hardware_offers
         SET raw_payload = '{}', raw_payload_at = NULL, updated_at = datetime('now')
         WHERE raw_payload <> '{}'
           AND julianday(replace(substr(raw_payload_at, 1, 19), 'T', ' '))
               < julianday('now', '-90 days')`,
      )
      .run();
    return json({ success: true, purged: result.meta?.changes ?? 0 });
  }

  if (pathname === '/api/scraper/offers' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 500) || 500, 5000);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
    const source = url.searchParams.get('source');

    // An offer with no successful check inside the staleness window leaves
    // the quoted set.
    await env.DB
      .prepare(
        `UPDATE hardware_offers
         SET status = 'review_required', reason_code = 'unverified_stale', updated_at = datetime('now')
         WHERE status = 'qualified'
           AND (last_checked IS NULL
             OR julianday(replace(substr(last_checked, 1, 19), 'T', ' ')) < julianday('now', ?))`,
      )
      .bind(`-${UNVERIFIED_AFTER_DAYS} days`)
      .run();

    const columns =
      `id, source_site, source_listing_id, source_url, seller_id, seller_name, price, currency,
       price_ngn, price_ngn_rounded, fx_rate, fx_rate_date, fx_source,
       price_kind, unit_basis, unit_quantity, condition, in_stock, trust_tier, stated_specs,
       trading_signals, raw_payload, raw_payload_at, image_hash, status, reason_code, not_found_strikes, last_checked,
       canonical_id,
       (SELECT COUNT(*) FROM hardware_offers duplicate
        WHERE duplicate.source_site = hardware_offers.source_site
          AND duplicate.seller_id = hardware_offers.seller_id
          AND duplicate.price = hardware_offers.price
          AND duplicate.currency = hardware_offers.currency
          AND duplicate.image_hash = hardware_offers.image_hash
          AND duplicate.status = 'excluded'
          AND duplicate.reason_code = 'duplicate_of_existing_offer') AS collapsed_count`;
    const rows = source
      ? await env.DB
          .prepare(
            `SELECT ${columns} FROM hardware_offers WHERE source_site = ? ORDER BY COALESCE(last_checked, '') ASC, id ASC LIMIT ? OFFSET ?`,
          )
          .bind(source, limit, offset)
          .all<Record<string, unknown>>()
      : await env.DB
          .prepare(
            `SELECT ${columns} FROM hardware_offers ORDER BY COALESCE(last_checked, '') ASC, id ASC LIMIT ? OFFSET ?`,
          )
          .bind(limit, offset)
          .all<Record<string, unknown>>();

    return json(
      (rows.results ?? []).map((row) => ({
        ...row,
        stated_specs: parseJson(row.stated_specs),
        trading_signals: parseJson(row.trading_signals),
        raw_payload: parseJson(row.raw_payload),
      })),
    );
  }

  if (pathname === '/api/scraper/offers' && method === 'POST') {
    const body = await readBody(request);
    const offers = Array.isArray(body.offers) ? body.offers : [];
    if (offers.length === 0) return badRequest('No offers in the request.');
    if (offers.length > 12) return badRequest('An offer request can hold at most 12 items.');

    for (const raw of offers) {
      const offer = raw as Record<string, unknown>;
      const sourceSite = text(offer.source_site);
      const sourceListingId = text(offer.source_listing_id);
      if (!sourceSite || !sourceListingId) return badRequest('An offer is missing its source site or listing id.');

      const givenStatus = text(offer.status, 'review_required');
      if (!isOfferStatus(givenStatus)) return badRequest(`Unknown offer status: ${givenStatus}`);

      const trustTier = text(offer.trust_tier, 'unknown');
      if (!isTrustTier(trustTier)) return badRequest(`Unknown trust tier: ${trustTier}`);

      const givenReason = offer.reason_code == null ? null : text(offer.reason_code);
      if (givenReason !== null && !isReasonCode(givenReason)) {
        return badRequest(`Unknown reason code: ${givenReason}`);
      }

      // Three genuine not-found checks remove the listing from the catalogue.
      const strikes = Math.max(0, number(offer.not_found_strikes) ?? 0);
      const delisted = strikes >= NOT_FOUND_STRIKES;
      const status = delisted ? 'excluded' : givenStatus;
      const reasonCode = delisted ? 'listing_not_found' : givenReason;

      const id = offerId(sourceSite, sourceListingId);
      const previous = await env.DB
        .prepare(
          'SELECT price, currency, price_ngn_rounded FROM hardware_offers WHERE source_site = ? AND source_listing_id = ?',
        )
        .bind(sourceSite, sourceListingId)
        .first<{ price: number | null; currency: string; price_ngn_rounded: number | null }>();

      await env.DB
        .prepare(
          `INSERT INTO hardware_offers (
             id, canonical_id, bucket_key, source_site, source_url, source_listing_id,
             seller_id, seller_name, price, currency, price_ngn, price_ngn_rounded,
             fx_rate, fx_rate_date, fx_source, price_kind, unit_basis, unit_quantity,
             condition, in_stock, trust_tier, stated_specs, trading_signals, raw_payload, raw_payload_at,
             image_hash, status, reason_code, not_found_strikes, last_checked, scraped_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(source_site, source_listing_id) DO UPDATE SET
             canonical_id = COALESCE(excluded.canonical_id, hardware_offers.canonical_id),
             bucket_key = COALESCE(excluded.bucket_key, hardware_offers.bucket_key),
             price = excluded.price,
             currency = excluded.currency,
             price_ngn = excluded.price_ngn,
             price_ngn_rounded = excluded.price_ngn_rounded,
             fx_rate = excluded.fx_rate,
             fx_rate_date = excluded.fx_rate_date,
             fx_source = excluded.fx_source,
             price_kind = excluded.price_kind,
             unit_basis = excluded.unit_basis,
             unit_quantity = excluded.unit_quantity,
             condition = excluded.condition,
             in_stock = excluded.in_stock,
             trust_tier = excluded.trust_tier,
             stated_specs = excluded.stated_specs,
             trading_signals = excluded.trading_signals,
             raw_payload = excluded.raw_payload,
             raw_payload_at = excluded.raw_payload_at,
             image_hash = COALESCE(excluded.image_hash, hardware_offers.image_hash),
             status = excluded.status,
             reason_code = excluded.reason_code,
             not_found_strikes = excluded.not_found_strikes,
             last_checked = excluded.last_checked,
             scraped_at = excluded.scraped_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          id,
          text(offer.canonical_id) || null,
          text(offer.bucket_key) || null,
          sourceSite,
          text(offer.source_url),
          sourceListingId,
          text(offer.seller_id) || null,
          text(offer.seller_name) || null,
          number(offer.price),
          text(offer.currency, 'NGN'),
          number(offer.price_ngn),
          number(offer.price_ngn_rounded),
          number(offer.fx_rate),
          text(offer.fx_rate_date) || null,
          text(offer.fx_source) || null,
          text(offer.price_kind, 'cash'),
          text(offer.unit_basis) || null,
          number(offer.unit_quantity),
          text(offer.condition, 'unknown'),
          text(offer.in_stock, 'unknown'),
          trustTier,
          JSON.stringify(parseJson(offer.stated_specs)),
          JSON.stringify(parseJson(offer.trading_signals)),
          JSON.stringify(parseJson(offer.raw_payload)),
          text(offer.raw_payload_at) || text(offer.scraped_at, new Date().toISOString()) || null,
          text(offer.image_hash) || null,
          status,
          reasonCode,
          strikes,
          text(offer.last_checked) || null,
          text(offer.scraped_at, new Date().toISOString()),
          new Date().toISOString(),
        )
        .run();

      // A changed raw quote leaves a trail. A published price uses the same
      // table with a hardware row id and no offer id.
      const nextPrice = number(offer.price);
      const nextCurrency = text(offer.currency, 'NGN').toUpperCase();
      const previousPrice = previous?.price ?? null;
      const previousCurrency = (previous?.currency ?? 'NGN').toUpperCase();
      const nextNgn = number(offer.price_ngn_rounded);
      // Rows written before the FX columns existed have no stored naira value.
      // A naira row's raw price is its naira value, so it is the baseline.
      const previousNgn = previous
        ? previous.price_ngn_rounded ?? (previousCurrency === 'NGN' ? previous.price : null)
        : null;
      if (previous && nextPrice !== null) {
        const rawChanged = previousPrice !== nextPrice || previousCurrency !== nextCurrency;
        // A dollar quote can keep its raw price while the naira value moves.
        const ngnChanged = nextNgn !== null && nextNgn !== previousNgn;
        if (rawChanged || ngnChanged) {
          await env.DB
            .prepare(
              `INSERT INTO price_history (hardware_row_id, offer_id, price, median_at_publish, reason, date, currency)
               VALUES ('', ?, ?, NULL, ?, datetime('now'), ?)`,
            )
            .bind(
              id,
              rawChanged ? nextPrice : nextNgn,
              rawChanged ? 'offer_change' : 'fx_change',
              rawChanged ? nextCurrency : 'NGN',
            )
            .run();
        }
      }
    }

    return json({ success: true, count: offers.length });
  }

  if (pathname === '/api/scraper/candidates' && method === 'POST') {
    const body = await readBody(request);
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.length === 0) return badRequest('No candidates in the request.');
    if (candidates.length > 40) return badRequest('A candidate request can hold at most 40 items.');

    for (const raw of candidates) {
      const candidate = raw as Record<string, unknown>;
      const id = text(candidate.id);
      if (!id) return badRequest('A candidate is missing its id.');

      const status = text(candidate.status, 'new');
      if (!isCandidateStatus(status)) return badRequest(`Unknown candidate status: ${status}`);

      await env.DB
        .prepare(
          `INSERT INTO hardware_candidates (
             id, canonical_id, bucket_key, current_hardware_row, product_type, status,
             proposed_data, proposed_price, current_price, offer_ids, source_urls,
             provenance, risk_flags, rejected_with_reason, reviewer, reviewed_at, published_hardware_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             canonical_id = excluded.canonical_id,
             bucket_key = excluded.bucket_key,
             current_hardware_row = excluded.current_hardware_row,
             product_type = excluded.product_type,
             status = CASE
               WHEN hardware_candidates.status IN ('rejected', 'duplicate', 'approved', 'published')
                 THEN hardware_candidates.status
               ELSE excluded.status
             END,
             proposed_data = excluded.proposed_data,
             proposed_price = excluded.proposed_price,
             current_price = excluded.current_price,
             offer_ids = excluded.offer_ids,
             source_urls = excluded.source_urls,
             provenance = excluded.provenance,
             risk_flags = excluded.risk_flags,
             updated_at = datetime('now')`,
        )
        .bind(
          id,
          text(candidate.canonical_id) || null,
          text(candidate.bucket_key) || null,
          text(candidate.current_hardware_row) || null,
          text(candidate.product_type, 'panel'),
          status,
          JSON.stringify(parseJson(candidate.proposed_data)),
          number(candidate.proposed_price),
          number(candidate.current_price),
          JSON.stringify(Array.isArray(candidate.offer_ids) ? candidate.offer_ids : []),
          JSON.stringify(Array.isArray(candidate.source_urls) ? candidate.source_urls : []),
          JSON.stringify(Array.isArray(candidate.provenance) ? candidate.provenance : []),
          JSON.stringify(Array.isArray(candidate.risk_flags) ? candidate.risk_flags : []),
          text(candidate.rejected_with_reason) || null,
          text(candidate.reviewer) || null,
          candidate.reviewed_at == null ? null : text(candidate.reviewed_at),
          text(candidate.published_hardware_id) || null,
        )
        .run();
    }

    return json({ success: true, count: candidates.length });
  }

  if (pathname === '/api/scraper/candidates' && method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 500);
    const rows = status
      ? await env.DB
          .prepare('SELECT * FROM hardware_candidates WHERE status = ? ORDER BY created_at DESC LIMIT ?')
          .bind(status, limit)
          .all<Record<string, unknown>>()
      : await env.DB
          .prepare('SELECT * FROM hardware_candidates ORDER BY created_at DESC LIMIT ?')
          .bind(limit)
          .all<Record<string, unknown>>();

    return json(
      (rows.results ?? []).map((row) => ({
        ...row,
        proposed_data: parseJson(row.proposed_data),
        offer_ids: parseJson(row.offer_ids),
        source_urls: parseJson(row.source_urls),
        provenance: parseJson(row.provenance),
        risk_flags: parseJson(row.risk_flags),
      })),
    );
  }

  // The review screen approves, rejects and marks duplicates. The route takes
  // a list of ids so a bulk approval is one call.
  if (pathname === '/api/scraper/candidates/review' && method === 'POST') {
    const body = await readBody(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value) => text(value)).filter(Boolean).slice(0, 50)
      : [];
    if (ids.length === 0) return badRequest('No candidate ids in the request.');

    const status = text(body.status);
    if (!['approved', 'rejected', 'duplicate'].includes(status)) {
      return badRequest('A review can only set approved, rejected or duplicate.');
    }

    const placeholders = ids.map(() => '?').join(',');
    await env.DB
      .prepare(
        `UPDATE hardware_candidates
         SET status = ?, reviewer = ?, reviewed_at = datetime('now'), rejected_with_reason = ?
         WHERE id IN (${placeholders})`,
      )
      .bind(status, text(body.reviewer, 'admin'), text(body.reason) || null, ...ids)
      .run();

    return json({ success: true, count: ids.length, status });
  }

  const publishMatch = pathname.match(/^\/api\/scraper\/candidates\/([^/]+)\/publish$/);
  if (publishMatch && method === 'POST') {
    const candidateId = decodeURIComponent(publishMatch[1]);
    const body = await readBody(request);
    const candidate = await env.DB
      .prepare('SELECT * FROM hardware_candidates WHERE id = ?')
      .bind(candidateId)
      .first<Record<string, unknown>>();
    if (!candidate) return json({ error: 'Candidate not found.' }, 404);
    const candidateStatus = text(candidate.status);
    if (['rejected', 'duplicate'].includes(candidateStatus)) {
      return json(
        {
          error: 'candidate-not-publishable',
          message: `A ${candidateStatus} candidate cannot be published.`,
        },
        409,
      );
    }

    const hardwareId = text(candidate.current_hardware_row) || text(candidate.canonical_id);
    if (!hardwareId) return badRequest('The candidate has no hardware row id.');

    const existing = await env.DB
      .prepare('SELECT id, data, price_source FROM hardware WHERE id = ?')
      .bind(hardwareId)
      .first<{ id: string; data: string; price_source: string }>();

    const proposedData = parseJson(candidate.proposed_data) as Record<string, unknown>;
    const proposedPrice = number(candidate.proposed_price);
    if (proposedPrice === null) return badRequest('The candidate has no proposed price.');
    const existingData = parseJson(existing?.data) as Record<string, unknown>;
    const existingPrice = number(existingData.price);

    // A row that misses a field the calculator reads never goes live. The
    // review screen asks for the missing values first.
    const missing = missingSpecs(text(candidate.product_type, 'panel'), proposedData);
    if (missing.length > 0) {
      return json(
        {
          error: 'missing-specs',
          message: `The row is missing ${missing.join(', ')}. Fill them in before publishing.`,
          missing,
        },
        409,
      );
    }

    // A manual row keeps its price until an admin accepts the scraped median.
    if (existing && existing.price_source === 'manual' && body.accept_manual !== true) {
      return json(
        {
          error: 'manual-row',
          message: 'This row has a manual price. Accept the scraped median to replace it.',
          current_price: existingPrice,
          proposed_price: proposedPrice,
        },
        409,
      );
    }

    const canonicalId = text(candidate.canonical_id);
    if (!canonicalId) {
      return json(
        {
          error: 'stale-candidate',
          message: 'This candidate has no canonical product id.',
        },
        409,
      );
    }
    const candidateOffers = parseJson(candidate.offer_ids);
    const offerIds = Array.isArray(candidateOffers)
      ? candidateOffers.filter((value): value is string => typeof value === 'string').slice(0, 500)
      : [];
    if (offerIds.length === 0) {
      return json(
        {
          error: 'stale-candidate',
          message: 'This candidate has no offers. Run the sweep again.',
        },
        409,
      );
    }
    const offerPlaceholders = offerIds.map(() => '?').join(',');
    const offers = await env.DB
      .prepare(
        `SELECT id, seller_id, source_site, status, in_stock, unit_basis, condition,
                price, price_ngn_rounded, last_checked
         FROM hardware_offers WHERE id IN (${offerPlaceholders}) AND canonical_id = ?`,
      )
      .bind(...offerIds, canonicalId)
      .all<{
        id: string;
        seller_id: string | null;
        source_site: string;
        status: string;
        in_stock: string;
        unit_basis: string | null;
        condition: string;
        price: number | null;
        price_ngn_rounded: number | null;
        last_checked: string | null;
      }>();

    const supportingOffers = (offers.results ?? []).filter((offer) =>
      isQualifiedPublishSupport({
        ...offer,
        price: offer.price_ngn_rounded ?? offer.price,
      }),
    );

    // A candidate with no fresh qualified offer has no current price evidence.
    if (supportingOffers.length === 0) {
      return json(
        {
          error: 'stale-candidate',
          message: 'No fresh qualified offer supports this candidate. Run the sweep again.',
        },
        409,
      );
    }

    const sources = [...new Set(supportingOffers.map((offer) => offer.source_site))];
    const sellerCount = new Set(
      supportingOffers.map((offer) => offer.seller_id ?? offer.id),
    ).size;
    const checked = supportingOffers
      .map((offer) => offer.last_checked)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop();

    const provenance = parseJson(candidate.provenance) as Array<Record<string, unknown>>;
    const tags = [text(candidate.product_type, 'panel'), 'scraped'];
    if (candidate.bucket_key) tags.push('representative');
    if (provenance.some((entry) => entry.kind === 'class_derived')) tags.push('estimated-specs');

    const data = { ...proposedData };
    if (proposedPrice !== null) data.price = proposedPrice;

    await env.DB
      .prepare(
        `INSERT INTO hardware (id, user_id, type, data, tags, description, price_source)
         VALUES (?, 'system', ?, ?, ?, ?, 'scraped')
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           data = excluded.data,
           tags = excluded.tags,
           description = excluded.description,
           price_source = 'scraped'`,
      )
      .bind(
        hardwareId,
        text(candidate.product_type, 'panel'),
        JSON.stringify(data),
        JSON.stringify(tags),
        buildDescription(sellerCount, checked ?? null, proposedPrice, sources),
      )
      .run();

    if (existingPrice !== proposedPrice) {
      await env.DB
        .prepare(
          `INSERT INTO price_history (hardware_row_id, price, median_at_publish, reason, date, currency)
           VALUES (?, ?, ?, 'publish', datetime('now'), 'NGN')`,
        )
        .bind(hardwareId, proposedPrice, proposedPrice)
        .run();
    }

    await env.DB
      .prepare(
        `UPDATE hardware_candidates
         SET status = 'published', published_hardware_id = ?, reviewed_at = ?, reviewer = ?
         WHERE id = ?`,
      )
      .bind(hardwareId, new Date().toISOString(), text(body.reviewer, 'admin'), candidateId)
      .run();

    return json({ success: true, id: hardwareId, price: proposedPrice });
  }

  if (pathname === '/api/scraper/queue' && method === 'POST') {
    const body = await readBody(request);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return badRequest('No queue items in the request.');
    if (rawItems.length > 100) return badRequest('A queue request can hold at most 100 items.');

    const items = new Map<string, { offer_id: string; image_url: string; image_hash: string }>();
    for (const raw of rawItems) {
      const item = raw as Record<string, unknown>;
      const offerId = text(item.offer_id);
      const imageUrl = text(item.image_url);
      const imageHash = text(item.image_hash).toLowerCase();
      if (!offerId || !imageUrl || !/^[a-f0-9]{64}$/.test(imageHash)) {
        return badRequest('A queue item needs an offer id, an image url and a SHA-256 image hash.');
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        return badRequest('A queue item has an invalid image url.');
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return badRequest('A queue item image url must use HTTP or HTTPS.');
      }
      if (!items.has(imageHash)) items.set(imageHash, { offer_id: offerId, image_url: imageUrl, image_hash: imageHash });
    }

    const hashes = [...items.keys()];
    const placeholders = hashes.map(() => '?').join(',');
    const existingRows = await env.DB
      .prepare(
        `SELECT image_hash, status, result FROM scraper_queue WHERE image_hash IN (${placeholders})`,
      )
      .bind(...hashes)
      .all<{ image_hash: string; status: string; result: string }>();
    const existing = new Map((existingRows.results ?? []).map((row) => [row.image_hash, row]));

    const statements = [];
    const cachedSpecs = new Map<string, Record<string, unknown>>();
    let cached = 0;
    for (const item of items.values()) {
      const previous = existing.get(item.image_hash);
      if (previous?.status === 'done') {
        cached += 1;
        try {
          cachedSpecs.set(
            item.image_hash,
            validateEnrichmentResult(parseJson(previous.result)),
          );
        } catch {
          // An old malformed result is ignored. The hash stays cached.
        }
        continue;
      }
      if (previous && previous.status !== 'failed') continue;
      statements.push(
        env.DB
          .prepare(
            `INSERT INTO scraper_queue (id, offer_id, image_url, image_hash, status, result, error)
             VALUES (?, ?, ?, ?, 'pending', '{}', NULL)
             ON CONFLICT(id) DO UPDATE SET
               offer_id = excluded.offer_id,
               image_url = excluded.image_url,
               status = 'pending',
               result = '{}',
               error = NULL,
               updated_at = datetime('now')
             WHERE scraper_queue.status = 'failed'`,
          )
          .bind(`queue:${item.image_hash}`, item.offer_id, item.image_url, item.image_hash),
      );
    }
    if (statements.length > 0) await env.DB.batch(statements);
    await applyEnrichmentToHashes(env.DB, cachedSpecs);
    return json({ success: true, count: statements.length, cached });
  }

  if (pathname === '/api/scraper/queue' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10) || 10, 50);
    const rows = await env.DB
      .prepare(
        `SELECT id, offer_id, image_url, image_hash, attempts
         FROM scraper_queue
         WHERE status = 'pending'
            OR (status = 'processing'
                AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes'))
            OR (status = 'failed'
                AND attempts < ?
                AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes'))
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(MAX_QUEUE_ATTEMPTS, limit)
      .all<{ id: string; offer_id: string; image_url: string; image_hash: string; attempts: number }>();

    const items = rows.results ?? [];
    if (items.length === 0) return json([]);

    // The claim and the read are one statement, so two drainers cannot take
    // the same row. The rows this call did not claim are not returned.
    const placeholders = items.map(() => '?').join(',');
    const claimed = await env.DB
      .prepare(
        `UPDATE scraper_queue
         SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
         WHERE id IN (${placeholders})
           AND attempts < ?
           AND (status = 'pending'
                OR (status = 'processing'
                    AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes'))
                OR (status = 'failed'
                    AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes')))
         RETURNING id, offer_id, image_url, image_hash, attempts`,
      )
      .bind(...items.map((item) => item.id), MAX_QUEUE_ATTEMPTS)
      .all<{ id: string; offer_id: string; image_url: string; image_hash: string; attempts: number }>();

    return json(claimed.results ?? []);
  }

  const queueMatch = pathname.match(/^\/api\/scraper\/queue\/([^/]+)$/);
  if (queueMatch && method === 'POST') {
    const queueId = decodeURIComponent(queueMatch[1]);
    const body = await readBody(request);
    const status = text(body.status);
    if (status !== 'done' && status !== 'failed') {
      return badRequest('A queue result must be done or failed.');
    }

    const item = await env.DB
      .prepare('SELECT id, image_hash FROM scraper_queue WHERE id = ?')
      .bind(queueId)
      .first<{ id: string; image_hash: string }>();
    if (!item) return json({ error: 'Queue item not found.' }, 404);

    let result: Record<string, unknown> = {};
    let error: string | null = null;
    if (status === 'done') {
      try {
        result = validateEnrichmentResult(body.result);
      } catch (validationError) {
        return badRequest(
          validationError instanceof Error ? validationError.message : 'The enrichment result is invalid.',
        );
      }
    } else {
      error = text(body.error);
      if (!error) return badRequest('A failed queue result needs an error message.');
    }

    await env.DB
      .prepare(
        `UPDATE scraper_queue
         SET status = ?, result = ?, error = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(status, JSON.stringify(result), error, queueId)
      .run();

    if (status === 'done') {
      await applyEnrichmentToHash(env.DB, item.image_hash, result);
    }
    return json({ success: true });
  }

  return null;
}
