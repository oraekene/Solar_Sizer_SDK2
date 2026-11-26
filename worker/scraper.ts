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
  DEFAULT_THRESHOLDS,
  isCandidateStatus,
  isOfferStatus,
  isReasonCode,
  isTrustTier,
  missingSpecs,
  offerId,
  readThresholds,
} from '../scraper/rules.ts';
import type { Thresholds } from '../scraper/rules.ts';

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

// Kapso accepts a message before WhatsApp delivers it. A closed customer
// service window makes WhatsApp reject the message, so the alert route reads
// the delivery status before it reports success. The status settles a moment
// after the send, so the route waits and reads it again. A status that never
// settles is reported as pending, because only a refusal is certain.
const DELIVERY_ATTEMPTS = 3;
const DELIVERY_WAIT_MS = 1_200;

async function deliveryLookup(
  sendBody: string,
  phoneNumberId: string,
  apiKey: string,
): Promise<{ state: string; failure: string | null }> {
  const messageId = (() => {
    const parsed = parseJson(sendBody) as { messages?: { id?: string }[] };
    return parsed.messages?.[0]?.id ?? null;
  })();
  if (!messageId) return { state: 'no_message_id', failure: null };

  for (let attempt = 0; attempt < DELIVERY_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, DELIVERY_WAIT_MS));
    try {
      const response = await fetch(
        `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages/${encodeURIComponent(messageId)}`,
        { headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) {
        const body = (await response.text()).slice(0, 120);
        return { state: `http_${response.status} ${body}`.trim(), failure: null };
      }
      const data = (await response.json()) as {
        kapso?: { status?: string; statuses?: { errors?: { message?: string }[] }[] };
      };
      const state = data.kapso?.status ?? 'unknown';
      if (state === 'failed') {
        const reasons = (data.kapso?.statuses ?? []).flatMap((entry) => entry.errors ?? []);
        const failure = reasons.map((reason) => reason.message).filter(Boolean).join('; ');
        return { state, failure: failure || 'failed' };
      }
      if (state === 'delivered' || state === 'read') return { state, failure: null };
    } catch {
      return { state: 'lookup_error', failure: null };
    }
  }
  return { state: 'pending', failure: null };
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// The status of a candidate that a human has already decided. The upsert
// keeps it.
const KEPT_CANDIDATE_STATUSES = ['rejected', 'duplicate', 'approved', 'published'];

// The values that the candidate upsert writes. The free plan counts a row
// that holds the same values as a write, and every run sends every candidate,
// so the route compares these with the stored row before it writes.
export function candidateValues(candidate: Record<string, unknown>): Record<string, unknown> {
  return {
    canonical_id: text(candidate.canonical_id) || null,
    bucket_key: text(candidate.bucket_key) || null,
    current_hardware_row: text(candidate.current_hardware_row) || null,
    product_type: text(candidate.product_type, 'panel'),
    status: text(candidate.status, 'new'),
    proposed_data: JSON.stringify(parseJson(candidate.proposed_data)),
    proposed_price: number(candidate.proposed_price),
    current_price: number(candidate.current_price),
    offer_ids: JSON.stringify(Array.isArray(candidate.offer_ids) ? candidate.offer_ids : []),
    source_urls: JSON.stringify(Array.isArray(candidate.source_urls) ? candidate.source_urls : []),
    provenance: JSON.stringify(Array.isArray(candidate.provenance) ? candidate.provenance : []),
    risk_flags: JSON.stringify(Array.isArray(candidate.risk_flags) ? candidate.risk_flags : []),
  };
}

// True when the stored row already holds the values that the upsert would
// write, so the row does not need to be written again.
export function candidateUnchanged(
  before: Record<string, unknown> | null,
  values: Record<string, unknown>,
): boolean {
  if (!before) return false;
  const storedStatus = text(before.status);
  const keptStatus = KEPT_CANDIDATE_STATUSES.includes(storedStatus) ? storedStatus : null;
  for (const [field, value] of Object.entries(values)) {
    const expected = field === 'status' && keptStatus ? keptStatus : value;
    const stored = before[field];
    if (stored === null || stored === undefined) {
      if (expected !== null && expected !== undefined) return false;
      continue;
    }
    if (String(stored) !== String(expected)) return false;
  }
  return true;
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
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        throw new Error(`The enrichment field ${field} must be a positive number.`);
      }
      // The model writes zero for a value it cannot see. Zero is not a
      // reading, so it is dropped like a missing value and the other fields
      // of the answer are kept.
      if (raw === 0) continue;
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
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): boolean {
  if (offer.status !== 'qualified' || offer.in_stock !== 'true') return false;
  if (offer.unit_basis !== 'piece' && offer.unit_basis !== 'derived') return false;
  if (['used', 'foreign_used', 'refurbished', 'open_box'].includes(offer.condition)) return false;
  if (typeof offer.price !== 'number' || offer.price <= 0) return false;
  const checked = Date.parse(offer.last_checked ?? '');
  if (Number.isNaN(checked)) return false;
  const age = now - checked;
  return age >= -24 * 60 * 60 * 1000 && age <= thresholds.unverified_after_days * 24 * 60 * 60 * 1000;
}

/** The trust and review numbers, stored in the settings table. */
async function loadThresholds(db: D1Database): Promise<Thresholds> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = 'scraper_thresholds'")
    .first<{ value: string | null }>();
  return readThresholds(row?.value ? parseJson(row.value) : null);
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

    // The report also carries the trust spread, the review counts and the
    // enrichment queue, so the four-week gates can be read without a query.
    const trustRows = await env.DB
      .prepare('SELECT trust_tier, COUNT(*) AS count FROM hardware_offers GROUP BY trust_tier')
      .all<{ trust_tier: string; count: number }>();
    const approvalRows = await env.DB
      .prepare('SELECT status, COUNT(*) AS count FROM hardware_candidates GROUP BY status')
      .all<{ status: string; count: number }>();
    const queueRows = await env.DB
      .prepare('SELECT status, COUNT(*) AS count FROM scraper_queue GROUP BY status')
      .all<{ status: string; count: number }>();

    const report = {
      ...(typeof body.report === 'object' && body.report ? body.report : {}),
      trust: Object.fromEntries((trustRows.results ?? []).map((row) => [row.trust_tier, row.count])),
      approvals: Object.fromEntries((approvalRows.results ?? []).map((row) => [row.status, row.count])),
      enrichment: {
        queue: Object.fromEntries((queueRows.results ?? []).map((row) => [row.status, row.count])),
        model_calls: (queueRows.results ?? []).reduce((sum, row) => sum + row.count, 0),
      },
    };

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
        JSON.stringify(report),
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

    const failure = await deliveryLookup(result, phoneNumberId, apiKey);
    if (failure.failure) {
      return json(
        { error: 'WhatsApp rejected the alert.', detail: failure.failure.slice(0, 300) },
        502,
      );
    }

    return json({ success: true, delivery: failure.state, detail: result.slice(0, 300) });
  }

  // The four-week gates, read straight from the tables so no manual query is
  // needed. The sample is a stratified draw the owner scores by hand.
  if (pathname === '/api/scraper/dashboard' && method === 'GET') {
    const url = new URL(request.url);
    const sampleSize = Math.min(Number(url.searchParams.get('sample') ?? 30) || 30, 100);

    const coverage = await env.DB
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN offers >= 2 THEN 1 ELSE 0 END) AS with_two_offers
         FROM (SELECT canonical_id, COUNT(*) AS offers
               FROM hardware_offers
               WHERE canonical_id IS NOT NULL AND status = 'qualified'
               GROUP BY canonical_id)`,
      )
      .first<{ total: number; with_two_offers: number }>();

    const freshness = await env.DB
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN julianday('now') - julianday(replace(substr(last_checked, 1, 19), 'T', ' ')) <= 2 THEN 1 ELSE 0 END) AS fresh
         FROM hardware_offers WHERE status = 'qualified'`,
      )
      .first<{ total: number; fresh: number }>();

    const approvalRows = await env.DB
      .prepare(
        `SELECT status, COUNT(*) AS count,
                SUM(CASE WHEN risk_flags = '[]' THEN 1 ELSE 0 END) AS without_risk_flags
         FROM hardware_candidates GROUP BY status`,
      )
      .all<{ status: string; count: number; without_risk_flags: number }>();

    const strata = await env.DB
      .prepare(
        `SELECT source_site, trust_tier, COUNT(*) AS count
         FROM hardware_offers WHERE status = 'qualified'
         GROUP BY source_site, trust_tier`,
      )
      .all<{ source_site: string; trust_tier: string; count: number }>();

    // The stratified draw: every source and every trust tier gets a share of
    // the sample, so one busy source cannot fill it alone.
    const sample: Record<string, unknown>[] = [];
    const groups = strata.results ?? [];
    const totalOffers = groups.reduce((sum, group) => sum + group.count, 0);
    for (const group of groups) {
      if (sample.length >= sampleSize) break;
      const take = Math.min(
        sampleSize - sample.length,
        Math.max(1, Math.round((group.count / Math.max(1, totalOffers)) * sampleSize)),
      );
      const rows = await env.DB
        .prepare(
          `SELECT id, source_site, source_listing_id, source_url, trust_tier, price, currency,
                  canonical_id, stated_specs, last_checked
           FROM hardware_offers
           WHERE source_site = ? AND trust_tier = ? AND status = 'qualified'
           ORDER BY RANDOM() LIMIT ?`,
        )
        .bind(group.source_site, group.trust_tier, take)
        .all<Record<string, unknown>>();
      for (const row of rows.results ?? []) {
        sample.push({ ...row, stated_specs: parseJson(row.stated_specs) });
      }
    }

    return json({
      coverage: {
        products: coverage?.total ?? 0,
        products_with_two_offers: coverage?.with_two_offers ?? 0,
      },
      freshness: {
        checked: freshness?.total ?? 0,
        fresh_within_48h: freshness?.fresh ?? 0,
        percent: freshness?.total ? Math.round(((freshness.fresh ?? 0) / freshness.total) * 100) : 0,
      },
      approvals: (approvalRows.results ?? []).map((row) => ({
        status: row.status,
        count: row.count,
        without_risk_flags: row.without_risk_flags ?? 0,
      })),
      sample,
    });
  }

  // An archived offer can be promoted into the review queue without a new
  // crawl, so a listing that was held back is not lost.
  if (pathname === '/api/scraper/offers/promote' && method === 'POST') {
    const body = await readBody(request);
    const offerId = text(body.offer_id);
    if (!offerId) return badRequest('An offer id is required.');

    const offer = await env.DB
      .prepare('SELECT * FROM hardware_offers WHERE id = ?')
      .bind(offerId)
      .first<Record<string, unknown>>();
    if (!offer) return badRequest('No offer with that id.');

    const stated = parseJson(offer.stated_specs) as Record<string, unknown>;
    const productType = stated.capacity_ah !== undefined || stated.battery_type !== undefined ? 'battery' : 'panel';
    const candidateId = `sc-${offerId}`;

    await env.DB
      .prepare(
        `INSERT INTO hardware_candidates (
           id, canonical_id, bucket_key, current_hardware_row, product_type, status,
           proposed_data, proposed_price, current_price, offer_ids, source_urls,
           provenance, risk_flags
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           status = CASE
             WHEN hardware_candidates.status IN ('rejected', 'duplicate', 'approved', 'published')
               THEN hardware_candidates.status
             ELSE 'pending_review'
           END,
           proposed_data = excluded.proposed_data,
           offer_ids = excluded.offer_ids,
           source_urls = excluded.source_urls,
           risk_flags = excluded.risk_flags,
           updated_at = datetime('now')`,
      )
      .bind(
        candidateId,
        text(offer.canonical_id) || null,
        text(offer.bucket_key) || null,
        null,
        productType,
        'pending_review',
        JSON.stringify(stated),
        number(offer.price),
        number(offer.price),
        JSON.stringify([offerId]),
        JSON.stringify([offer.source_url]),
        JSON.stringify([
          { source: offer.source_site, listing_id: offer.source_listing_id, promoted: true },
        ]),
        JSON.stringify(['promoted_from_archive']),
      )
      .run();

    // The offer leaves the archive, so the next sweep does not hold it back.
    await env.DB
      .prepare(
        `UPDATE hardware_offers
         SET status = 'qualified', reason_code = NULL, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(offerId)
      .run();

    return json({ success: true, candidate_id: candidateId });
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

  // The trust and review numbers live in the settings table, so the owner can
  // change them without a deploy.
  if (pathname === '/api/scraper/thresholds' && method === 'GET') {
    return json(await loadThresholds(env.DB));
  }

  if (pathname === '/api/scraper/thresholds' && method === 'POST') {
    const body = await readBody(request);
    const thresholds = readThresholds(body.value ?? body);
    await env.DB
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ('scraper_thresholds', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(thresholds))
      .run();
    return json(thresholds);
  }

  if (pathname === '/api/scraper/offers' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 500) || 500, 5000);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
    const source = url.searchParams.get('source');
    const thresholds = await loadThresholds(env.DB);

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
      .bind(`-${thresholds.unverified_after_days} days`)
      .run();

    const columns =
      `id, source_site, source_listing_id, source_url, seller_id, seller_name, price, currency,
       price_ngn, price_ngn_rounded, fx_rate, fx_rate_date, fx_source,
       price_kind, unit_basis, unit_quantity, condition, in_stock, trust_tier, stated_specs,
       trading_signals, raw_payload, raw_payload_at, image_hash, image_phash, image_thumb,
       status, reason_code, not_found_strikes, last_checked,
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
    const thresholds = await loadThresholds(env.DB);

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

      // The not-found checks that remove the listing.
      const strikes = Math.max(0, number(offer.not_found_strikes) ?? 0);
      const delisted = strikes >= thresholds.not_found_strikes;
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
             image_hash, image_phash, status, reason_code, not_found_strikes, last_checked, scraped_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
             image_phash = COALESCE(excluded.image_phash, hardware_offers.image_phash),
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
          text(offer.image_phash) || null,
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

    // The stored rows are read first, so a candidate that did not change is
    // not written again.
    const ids = candidates
      .map((raw) => text((raw as Record<string, unknown>).id))
      .filter(Boolean);
    const stored = new Map<string, Record<string, unknown>>();
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = await env.DB
        .prepare(
          `SELECT id, canonical_id, bucket_key, current_hardware_row, product_type, status,
                  proposed_data, proposed_price, current_price, offer_ids, source_urls,
                  provenance, risk_flags
           FROM hardware_candidates WHERE id IN (${placeholders})`,
        )
        .bind(...ids)
        .all<Record<string, unknown>>();
      for (const row of rows.results ?? []) stored.set(text(row.id), row);
    }

    let written = 0;
    for (const raw of candidates) {
      const candidate = raw as Record<string, unknown>;
      const id = text(candidate.id);
      if (!id) return badRequest('A candidate is missing its id.');

      const status = text(candidate.status, 'new');
      if (!isCandidateStatus(status)) return badRequest(`Unknown candidate status: ${status}`);

      const values = candidateValues(candidate);
      if (candidateUnchanged(stored.get(id) ?? null, values)) continue;

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
          values.canonical_id,
          values.bucket_key,
          values.current_hardware_row,
          values.product_type,
          values.status,
          values.proposed_data,
          values.proposed_price,
          values.current_price,
          values.offer_ids,
          values.source_urls,
          values.provenance,
          values.risk_flags,
          text(candidate.rejected_with_reason) || null,
          text(candidate.reviewer) || null,
          candidate.reviewed_at == null ? null : text(candidate.reviewed_at),
          text(candidate.published_hardware_id) || null,
        )
        .run();
      written += 1;
    }

    return json({ success: true, count: candidates.length, written });
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

    const thresholds = await loadThresholds(env.DB);
    const supportingOffers = (offers.results ?? []).filter((offer) =>
      isQualifiedPublishSupport(
        {
          ...offer,
          price: offer.price_ngn_rounded ?? offer.price,
        },
        Date.now(),
        thresholds,
      ),
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
    // The read uses the same rules as the claim below. A row that used every
    // attempt is never offered again, so a full batch of exhausted rows
    // cannot fill the limit and starve the rows that can still be claimed.
    const claimable = `attempts < ?
            AND (status = 'pending'
                 OR (status = 'processing'
                     AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes'))
                 OR (status = 'failed'
                     AND julianday(updated_at) < julianday('now', '-${QUEUE_RETRY_WAIT_MINUTES} minutes')))`;
    const rows = await env.DB
      .prepare(
        `SELECT id, offer_id, image_url, image_hash, attempts
         FROM scraper_queue
         WHERE ${claimable}
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
           AND ${claimable}
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
      .prepare('SELECT id, image_hash, offer_id FROM scraper_queue WHERE id = ?')
      .bind(queueId)
      .first<{ id: string; image_hash: string; offer_id: string }>();
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

    // The host also sends the perceptual hash and a small thumbnail of the
    // picture, so a re-encoded copy collapses and the review screen shows the
    // image without opening the seller's page.
    const phash = text(body.phash).toLowerCase();
    const thumb = text(body.thumb);
    if (phash || thumb) {
      await env.DB
        .prepare(
          `UPDATE hardware_offers
           SET image_phash = COALESCE(NULLIF(?, ''), image_phash),
               image_thumb = COALESCE(NULLIF(?, ''), image_thumb),
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(phash, thumb, item.offer_id)
        .run();
    }
    return json({ success: true });
  }

  return null;
}
