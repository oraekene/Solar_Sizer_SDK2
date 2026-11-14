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

type ScraperEnv = { DB: D1Database };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const badRequest = (message: string) => json({ error: message }, 400);

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

  if (pathname === '/api/scraper/offers' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 500) || 500, 5000);
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
       price_kind, unit_basis, unit_quantity, condition, in_stock, trust_tier, stated_specs,
       trading_signals, raw_payload, image_hash, status, reason_code, not_found_strikes, last_checked,
       canonical_id`;
    const rows = source
      ? await env.DB
          .prepare(`SELECT ${columns} FROM hardware_offers WHERE source_site = ? ORDER BY COALESCE(last_checked, '') ASC LIMIT ?`)
          .bind(source, limit)
          .all<Record<string, unknown>>()
      : await env.DB
          .prepare(`SELECT ${columns} FROM hardware_offers ORDER BY COALESCE(last_checked, '') ASC LIMIT ?`)
          .bind(limit)
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
        .prepare('SELECT price FROM hardware_offers WHERE source_site = ? AND source_listing_id = ?')
        .bind(sourceSite, sourceListingId)
        .first<{ price: number | null }>();

      await env.DB
        .prepare(
          `INSERT INTO hardware_offers (
             id, canonical_id, bucket_key, source_site, source_url, source_listing_id,
             seller_id, seller_name, price, currency, price_kind, unit_basis, unit_quantity,
             condition, in_stock, trust_tier, stated_specs, trading_signals, raw_payload,
             image_hash, status, reason_code, not_found_strikes, last_checked, scraped_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(source_site, source_listing_id) DO UPDATE SET
             canonical_id = COALESCE(excluded.canonical_id, hardware_offers.canonical_id),
             bucket_key = COALESCE(excluded.bucket_key, hardware_offers.bucket_key),
             price = excluded.price,
             currency = excluded.currency,
             price_kind = excluded.price_kind,
             unit_basis = excluded.unit_basis,
             unit_quantity = excluded.unit_quantity,
             condition = excluded.condition,
             in_stock = excluded.in_stock,
             trust_tier = excluded.trust_tier,
             stated_specs = excluded.stated_specs,
             trading_signals = excluded.trading_signals,
             raw_payload = excluded.raw_payload,
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
          text(offer.price_kind, 'cash'),
          text(offer.unit_basis) || null,
          number(offer.unit_quantity),
          text(offer.condition, 'unknown'),
          text(offer.in_stock, 'unknown'),
          trustTier,
          JSON.stringify(parseJson(offer.stated_specs)),
          JSON.stringify(parseJson(offer.trading_signals)),
          JSON.stringify(parseJson(offer.raw_payload)),
          text(offer.image_hash) || null,
          status,
          reasonCode,
          strikes,
          text(offer.last_checked) || null,
          text(offer.scraped_at, new Date().toISOString()),
          new Date().toISOString(),
        )
        .run();

      // A changed price leaves a trail. A published price uses the same table
      // with a hardware row id and no offer id.
      const nextPrice = number(offer.price);
      if (previous && previous.price !== null && nextPrice !== null && previous.price !== nextPrice) {
        await env.DB
          .prepare(
            `INSERT INTO price_history (hardware_row_id, offer_id, price, median_at_publish, reason, date)
             VALUES ('', ?, ?, ?, 'offer_change', datetime('now'))`,
          )
          .bind(id, nextPrice, nextPrice)
          .run();
      }
    }

    return json({ success: true, count: offers.length });
  }

  if (pathname === '/api/scraper/candidates' && method === 'POST') {
    const body = await readBody(request);
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (candidates.length === 0) return badRequest('No candidates in the request.');

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
             provenance, rejected_with_reason, reviewer, reviewed_at, published_hardware_id
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             canonical_id = excluded.canonical_id,
             bucket_key = excluded.bucket_key,
             current_hardware_row = excluded.current_hardware_row,
             product_type = excluded.product_type,
             status = CASE
               WHEN hardware_candidates.status IN ('rejected', 'duplicate', 'approved')
                 THEN hardware_candidates.status
               ELSE excluded.status
             END,
             proposed_data = excluded.proposed_data,
             proposed_price = excluded.proposed_price,
             current_price = excluded.current_price,
             offer_ids = excluded.offer_ids,
             source_urls = excluded.source_urls,
             provenance = excluded.provenance,
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
      })),
    );
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

    const hardwareId = text(candidate.current_hardware_row) || text(candidate.canonical_id);
    if (!hardwareId) return badRequest('The candidate has no hardware row id.');

    const existing = await env.DB
      .prepare('SELECT id, data, price_source FROM hardware WHERE id = ?')
      .bind(hardwareId)
      .first<{ id: string; data: string; price_source: string }>();

    const proposedData = parseJson(candidate.proposed_data) as Record<string, unknown>;
    const proposedPrice = number(candidate.proposed_price);

    // A manual row keeps its price until an admin accepts the scraped median.
    if (existing && existing.price_source === 'manual' && body.accept_manual !== true) {
      const currentData = parseJson(existing.data) as Record<string, unknown>;
      return json(
        {
          error: 'manual-row',
          message: 'This row has a manual price. Accept the scraped median to replace it.',
          current_price: number(currentData.price),
          proposed_price: proposedPrice,
        },
        409,
      );
    }

    const offerIds = parseJson(candidate.offer_ids) as string[];
    const placeholders = offerIds.map(() => '?').join(',');
    const offers = offerIds.length
      ? await env.DB
          .prepare(
            `SELECT source_site, last_checked FROM hardware_offers WHERE id IN (${placeholders})`,
          )
          .bind(...offerIds)
          .all<{ source_site: string; last_checked: string | null }>()
      : { results: [] as Array<{ source_site: string; last_checked: string | null }> };

    // A candidate whose offers all left the pool is stale. It never publishes.
    if (offers.results.length === 0) {
      return json(
        {
          error: 'stale-candidate',
          message: 'No offer supports this candidate any more. Run the sweep again.',
        },
        409,
      );
    }

    const sources = [...new Set((offers.results ?? []).map((offer) => offer.source_site))];
    const checked = (offers.results ?? [])
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
        buildDescription(offerIds.length, checked ?? null, proposedPrice, sources),
      )
      .run();

    if (proposedPrice !== null) {
      await env.DB
        .prepare(
          `INSERT INTO price_history (hardware_row_id, price, median_at_publish, reason, date)
           VALUES (?, ?, ?, 'publish', datetime('now'))`,
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

  if (pathname === '/api/scraper/queue' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10) || 10, 50);
    const rows = await env.DB
      .prepare(
        `SELECT id, offer_id, image_url, image_hash, attempts
         FROM scraper_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ id: string; offer_id: string; image_url: string; image_hash: string; attempts: number }>();

    const items = rows.results ?? [];
    for (const item of items) {
      await env.DB
        .prepare(
          `UPDATE scraper_queue SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(item.id)
        .run();
    }

    return json(items);
  }

  const queueMatch = pathname.match(/^\/api\/scraper\/queue\/([^/]+)$/);
  if (queueMatch && method === 'POST') {
    const queueId = decodeURIComponent(queueMatch[1]);
    const body = await readBody(request);
    const status = text(body.status, 'done');
    await env.DB
      .prepare(
        `UPDATE scraper_queue
         SET status = ?, result = ?, error = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        status === 'done' ? 'done' : status === 'failed' ? 'failed' : 'pending',
        JSON.stringify(parseJson(body.result)),
        text(body.error) || null,
        queueId,
      )
      .run();

    // The recognised specs belong to the offer, so the next sweep can use them.
    const specs = parseJson(body.result) as Record<string, unknown>;
    if (specs && typeof specs === 'object' && Object.keys(specs).length > 0) {
      const item = await env.DB
        .prepare('SELECT offer_id FROM scraper_queue WHERE id = ?')
        .bind(queueId)
        .first<{ offer_id: string }>();
      if (item) {
        const offer = await env.DB
          .prepare('SELECT stated_specs FROM hardware_offers WHERE id = ?')
          .bind(item.offer_id)
          .first<{ stated_specs: string }>();
        const merged = {
          ...(parseJson(offer?.stated_specs) as Record<string, unknown>),
          ...specs,
        };
        await env.DB
          .prepare(
            `UPDATE hardware_offers SET stated_specs = ?, updated_at = datetime('now') WHERE id = ?`,
          )
          .bind(JSON.stringify(merged), item.offer_id)
          .run();
      }
    }

    return json({ success: true });
  }

  return null;
}
