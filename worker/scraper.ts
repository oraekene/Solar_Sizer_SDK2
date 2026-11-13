// Hardware scraper admin routes. The design is in docs/scraper-design.md.
//
// Every route in this file is called with the admin key already checked. The
// scraper runner, the enrichment drainer on the always-on host and the review
// screen all use the same `x-admin-key` header.

export const REASON_CODES = [
  'used',
  'foreign_used',
  'refurbished',
  'listing_not_found',
  'missing_required_spec',
  'price_outlier',
  'price_range',
  'price_depends_on_quantity',
  'call_for_price',
  'bundle',
  'multi_variant',
  'installation_included',
  'ambiguous_unit',
  'usd_rate_unavailable',
  'trust_unknown_only',
  'duplicate_of_existing_offer',
  'wrong_product_type',
  'not_solar_hardware',
  'unverified_stale',
  'admin_rejected',
  'superseded',
] as const;

export const OFFER_STATUSES = ['qualified', 'excluded', 'review_required'] as const;
export const CANDIDATE_STATUSES = [
  'new',
  'enriched',
  'suggested',
  'pending_review',
  'approved',
  'published',
  'rejected',
  'duplicate',
] as const;
export const TRUST_TIERS = ['verified', 'established', 'unknown'] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type TrustTier = (typeof TRUST_TIERS)[number];

export type PriceInput = {
  price: number | null;
  status: string;
  in_stock: string;
  trust_tier: string;
  seller_id?: string | null;
};

export type MedianResult = {
  price: number | null;
  confidence: 'high' | 'low' | 'none';
  offer_count: number;
  seller_count: number;
  low_confidence: boolean;
};

export function isReasonCode(value: unknown): value is (typeof REASON_CODES)[number] {
  return typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value);
}

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === 'string' && (OFFER_STATUSES as readonly string[]).includes(value);
}

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return typeof value === 'string' && (CANDIDATE_STATUSES as readonly string[]).includes(value);
}

export function isTrustTier(value: unknown): value is TrustTier {
  return typeof value === 'string' && (TRUST_TIERS as readonly string[]).includes(value);
}

// The median comes from qualified offers that are in stock. A verified or
// established seller sets the price. When only unknown sellers remain, the
// median falls back to them and the row carries a low confidence flag.
export function medianPrice(offers: PriceInput[]): MedianResult {
  const usable = offers.filter(
    (offer) =>
      offer.status === 'qualified' &&
      offer.in_stock === 'true' &&
      typeof offer.price === 'number' &&
      offer.price > 0,
  );
  const trusted = usable.filter((offer) => offer.trust_tier === 'verified' || offer.trust_tier === 'established');
  const pool = trusted.length > 0 ? trusted : usable;
  if (pool.length === 0) {
    return { price: null, confidence: 'none', offer_count: 0, seller_count: 0, low_confidence: false };
  }

  const prices = pool.map((offer) => offer.price as number).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const price =
    prices.length % 2 === 1 ? prices[middle] : Math.round((prices[middle - 1] + prices[middle]) / 2);

  return {
    price,
    confidence: trusted.length > 0 ? 'high' : 'low',
    offer_count: pool.length,
    seller_count: new Set(pool.map((offer) => offer.seller_id ?? '')).size,
    low_confidence: trusted.length === 0,
  };
}

// A price inside the band publishes itself. A price outside the band waits for
// a human.
export function withinBand(nextPrice: number, currentPrice: number, band = 0.15): boolean {
  if (!Number.isFinite(nextPrice) || !Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  return Math.abs(nextPrice - currentPrice) / currentPrice <= band;
}

export function offerId(sourceSite: string, sourceListingId: string): string {
  return `${sourceSite}:${sourceListingId}`;
}

export function buildDescription(
  offerCount: number,
  lastChecked: string | null,
  median: number | null,
  sources: string[],
): string {
  const amount = median === null ? 'no price' : `₦${Math.round(median).toLocaleString('en-NG')}`;
  return `Aggregated from ${offerCount} sellers, last checked ${lastChecked ?? 'never'}. Median ${amount}. Sources: ${sources.join(', ')}`;
}

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

  if (pathname === '/api/scraper/offers' && method === 'POST') {
    const body = await readBody(request);
    const offers = Array.isArray(body.offers) ? body.offers : [];
    if (offers.length === 0) return badRequest('No offers in the request.');

    for (const raw of offers) {
      const offer = raw as Record<string, unknown>;
      const sourceSite = text(offer.source_site);
      const sourceListingId = text(offer.source_listing_id);
      if (!sourceSite || !sourceListingId) return badRequest('An offer is missing its source site or listing id.');

      const status = text(offer.status, 'review_required');
      if (!isOfferStatus(status)) return badRequest(`Unknown offer status: ${status}`);

      const trustTier = text(offer.trust_tier, 'unknown');
      if (!isTrustTier(trustTier)) return badRequest(`Unknown trust tier: ${trustTier}`);

      const reasonCode = offer.reason_code == null ? null : text(offer.reason_code);
      if (reasonCode !== null && !isReasonCode(reasonCode)) {
        return badRequest(`Unknown reason code: ${reasonCode}`);
      }

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
             image_hash, status, reason_code, last_checked, scraped_at, updated_at
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
             status = excluded.status,
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
