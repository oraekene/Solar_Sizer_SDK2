// The shared part of the two runners. It turns the offer pool into candidates,
// saves them and publishes the prices that stay inside the 15% band.

import { proposeCandidates } from './merge.ts';
import type { CrossPost, MergeOffer, Proposal } from './merge.ts';
import type { AliasTable } from './identity.ts';
import { applyFxRate } from './fx.ts';
import type { FxRate } from './fx.ts';
import type { WorkerClient, WorkerOfferRow } from './worker-client.ts';

export type OfferPayload = {
  source_site: string;
  source_listing_id: string;
  source_url: string;
  seller_id: string;
  seller_name: string;
  price: number | null;
  currency: string;
  price_kind: string;
  unit_basis: string | null;
  unit_quantity: number | null;
  condition: string;
  in_stock: string;
  trust_tier: string;
  stated_specs: Record<string, unknown>;
  trading_signals: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  raw_payload_at?: string | null;
  image_url?: string | null;
  image_hash?: string | null;
  price_ngn?: number | null;
  price_ngn_rounded?: number | null;
  fx_rate?: number | null;
  fx_rate_date?: string | null;
  fx_source?: string | null;
  status: string;
  reason_code: string | null;
  not_found_strikes?: number;
  last_checked: string;
  scraped_at: string;
  canonical_id?: string | null;
  bucket_key?: string | null;
};

export function offerKey(offer: { source_site: string; source_listing_id: string }): string {
  return `${offer.source_site}:${offer.source_listing_id}`;
}

// An empty value means the setting was not given, so the code default stays.
export function envNumber(name: string): number {
  const raw = process.env[name];
  if (!raw) return Number.NaN;
  return Number(raw);
}

export function toMergeOffer(offer: OfferPayload): MergeOffer {
  return {
    id: offerKey(offer),
    source_site: offer.source_site,
    source_url: offer.source_url,
    price: offer.price_ngn_rounded ?? offer.price_ngn ?? offer.price,
    raw_price: offer.price,
    currency: offer.currency,
    status: offer.status,
    in_stock: offer.in_stock,
    trust_tier: offer.trust_tier,
    seller_id: offer.seller_id,
    image_hash: offer.image_hash ?? null,
    unit_basis: offer.unit_basis,
    unit_quantity: offer.unit_quantity,
    condition: offer.condition,
    stated_specs: offer.stated_specs,
    trading_signals: offer.trading_signals ?? {},
    last_checked: offer.last_checked,
  };
}

// A row that came from the Worker keeps its fields, so a listing that is gone
// can be sent back with one more strike.
export function rowToPayload(row: WorkerOfferRow): OfferPayload {
  return {
    source_site: row.source_site,
    source_listing_id: row.source_listing_id,
    source_url: row.source_url,
    seller_id: row.seller_id ?? '',
    seller_name: row.seller_name ?? '',
    price: row.price,
    currency: row.currency,
    price_kind: row.price_kind,
    unit_basis: row.unit_basis,
    unit_quantity: row.unit_quantity,
    condition: row.condition,
    in_stock: row.in_stock,
    trust_tier: row.trust_tier,
    stated_specs: row.stated_specs ?? {},
    trading_signals: row.trading_signals ?? {},
    raw_payload: row.raw_payload ?? {},
    raw_payload_at: row.raw_payload_at,
    image_hash: row.image_hash,
    image_url: typeof row.trading_signals.image_url === 'string' ? row.trading_signals.image_url : null,
    price_ngn: row.price_ngn,
    price_ngn_rounded: row.price_ngn_rounded,
    fx_rate: row.fx_rate,
    fx_rate_date: row.fx_rate_date,
    fx_source: row.fx_source,
    status: row.status,
    reason_code: row.reason_code,
    not_found_strikes: row.not_found_strikes,
    last_checked: row.last_checked ?? new Date().toISOString(),
    scraped_at: row.last_checked ?? new Date().toISOString(),
    canonical_id: row.canonical_id,
  };
}

export type RebuildResult = {
  candidates: number;
  published: number;
  proposals: Proposal[];
  excluded: Array<{ offer_id: string; reason_code: string }>;
  cross_posts: CrossPost[];
  publish_errors: Array<{ id: string; error: string }>;
};

function needsImageEnrichment(offer: OfferPayload): boolean {
  const specs = offer.stated_specs ?? {};
  const productType = offer.trading_signals?.product_type;
  if (productType === 'battery') {
    return (
      typeof specs.battery_type !== 'string' ||
      typeof specs.max_parallel_strings !== 'number' ||
      typeof specs.min_c_rate !== 'number'
    );
  }
  return typeof specs.voc !== 'number' || typeof specs.isc !== 'number';
}

export function applyCrossPostSignals(
  pool: OfferPayload[],
  crossPosts: CrossPost[],
): { pool: OfferPayload[]; affected: Set<string> } {
  const affected = new Set<string>();
  const byId = new Map(pool.map((offer) => [offerKey(offer), offer]));
  const signals = new Map<string, { ids: Set<string>; imageHash: string }>();
  const addSignal = (id: string, otherId: string, imageHash: string) => {
    const current = signals.get(id) ?? { ids: new Set<string>(), imageHash };
    current.ids.add(otherId);
    current.imageHash = imageHash;
    signals.set(id, current);
    affected.add(id);
  };

  for (const crossPost of crossPosts) {
    if (!byId.has(crossPost.offer_id) || !byId.has(crossPost.existing_offer_id)) continue;
    addSignal(crossPost.offer_id, crossPost.existing_offer_id, crossPost.image_hash);
    addSignal(crossPost.existing_offer_id, crossPost.offer_id, crossPost.image_hash);
  }

  return {
    pool: pool.map((offer) => {
      const id = offerKey(offer);
      const signal = signals.get(id);
      const tradingSignals = { ...offer.trading_signals };
      if ('cross_posted_image_hash' in tradingSignals || 'cross_posted_offer_ids' in tradingSignals) {
        delete tradingSignals.cross_posted_image_hash;
        delete tradingSignals.cross_posted_offer_ids;
        affected.add(id);
      }
      if (signal) {
        tradingSignals.cross_posted_image_hash = signal.imageHash;
        tradingSignals.cross_posted_offer_ids = [...signal.ids].sort();
      }
      return { ...offer, trading_signals: tradingSignals };
    }),
    affected,
  };
}

export async function rebuildAndPublish(
  client: WorkerClient,
  options: {
    aliases: AliasTable;
    changed: OfferPayload[];
    pool: OfferPayload[];
    previous: WorkerOfferRow[];
    fx: FxRate | null;
  },
): Promise<RebuildResult> {
  const hardware = await client.listHardware();
  const convertedPool = options.pool.map((offer) => applyFxRate(offer, options.fx));
  const convertedChanged = options.changed.map((offer) => applyFxRate(offer, options.fx));
  const { proposals, excluded, cross_posts } = proposeCandidates(convertedPool.map(toMergeOffer), {
    aliases: options.aliases,
    hardware,
  });
  const crossPostSignals = applyCrossPostSignals(convertedPool, cross_posts);
  const finalPool = crossPostSignals.pool;
  const finalById = new Map(finalPool.map((offer) => [offerKey(offer), offer]));
  const finalChanged = convertedChanged.map(
    (offer) => finalById.get(offerKey(offer)) ?? offer,
  );

  // A change of the unit basis or the pack count always waits for a human.
  const previousById = new Map(options.previous.map((row) => [row.id, row]));
  const poolById = finalById;
  for (const proposal of proposals) {
    for (const offerId of proposal.offer_ids) {
      const before = previousById.get(offerId);
      const after = poolById.get(offerId);
      if (!before || !after) continue;
      if (before.unit_basis !== after.unit_basis || before.unit_quantity !== after.unit_quantity) {
        proposal.status = 'pending_review';
        if (!proposal.risk_flags.includes('unit basis changed')) {
          proposal.risk_flags.push('unit basis changed');
        }
      }
    }
  }

  // Every offer carries the canonical product it belongs to.
  const canonicalByOffer = new Map<string, { canonical_id: string; bucket_key: string }>();
  for (const proposal of proposals) {
    for (const offerId of proposal.offer_ids) {
      canonicalByOffer.set(offerId, {
        canonical_id: proposal.canonical_id,
        bucket_key: proposal.bucket_key,
      });
    }
  }

  const excludedById = new Map(excluded.map((entry) => [entry.offer_id, entry.reason_code]));
  const prepareForSave = (offer: OfferPayload): OfferPayload => {
    const target = canonicalByOffer.get(offerKey(offer));
    const reason = excludedById.get(offerKey(offer));
    return {
      ...offer,
      ...(target ? { canonical_id: target.canonical_id, bucket_key: target.bucket_key } : {}),
      ...(reason ? { status: 'excluded', reason_code: reason } : {}),
    };
  };

  const changedKeys = new Set(finalChanged.map(offerKey));
  const toSave = new Map<string, OfferPayload>();
  for (const offer of finalChanged) toSave.set(offerKey(offer), prepareForSave(offer));
  for (const offer of finalPool) {
    const id = offerKey(offer);
    const before = previousById.get(id);
    const fxChanged =
      before &&
      offer.currency.toUpperCase() !== 'NGN' &&
      (before.status !== offer.status ||
        before.price_ngn !== offer.price_ngn ||
        before.price_ngn_rounded !== offer.price_ngn_rounded ||
        before.fx_rate !== offer.fx_rate ||
        before.fx_rate_date !== offer.fx_rate_date ||
        before.fx_source !== offer.fx_source ||
        before.reason_code !== offer.reason_code);
    if (
      changedKeys.has(id) ||
      excludedById.has(id) ||
      crossPostSignals.affected.has(id) ||
      fxChanged
    ) {
      toSave.set(id, prepareForSave(offer));
    }
  }

  const changed = [...toSave.values()];
  await client.saveOffers(changed);
  await client.enqueueImages(
    finalChanged
      .filter((offer) => offer.image_url && offer.image_hash && needsImageEnrichment(offer))
      .map((offer) => ({
        offer_id: offerKey(offer),
        image_url: offer.image_url as string,
        image_hash: offer.image_hash as string,
      })),
  );
  await client.saveCandidates(
    proposals.map((proposal) => ({
      id: proposal.id,
      canonical_id: proposal.canonical_id,
      bucket_key: proposal.bucket_key,
      current_hardware_row: proposal.current_hardware_row,
      product_type: proposal.product_type,
      status: proposal.status,
      proposed_data: proposal.proposed_data,
      proposed_price: proposal.proposed_price,
      current_price: proposal.current_price,
      offer_ids: proposal.offer_ids,
      source_urls: proposal.source_urls,
      provenance: proposal.provenance,
      risk_flags: proposal.risk_flags,
    })),
  );

  // A price inside the band publishes itself. A failed publish is reported
  // and does not stop the run.
  let published = 0;
  const publishErrors: Array<{ id: string; error: string }> = [];
  for (const proposal of proposals) {
    if (proposal.status !== 'suggested') continue;
    try {
      await client.publishCandidate(proposal.id);
      published += 1;
    } catch (error) {
      publishErrors.push({ id: proposal.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    candidates: proposals.length,
    published,
    proposals,
    excluded,
    cross_posts,
    publish_errors: publishErrors,
  };
}
