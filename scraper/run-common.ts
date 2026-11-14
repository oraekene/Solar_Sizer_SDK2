// The shared part of the two runners. It turns the offer pool into candidates,
// saves them and publishes the prices that stay inside the 15% band.

import { proposeCandidates } from './merge.ts';
import type { MergeOffer, Proposal } from './merge.ts';
import type { AliasTable } from './identity.ts';
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

export function toMergeOffer(offer: OfferPayload): MergeOffer {
  return {
    id: offerKey(offer),
    source_site: offer.source_site,
    source_url: offer.source_url,
    price: offer.price,
    status: offer.status,
    in_stock: offer.in_stock,
    trust_tier: offer.trust_tier,
    seller_id: offer.seller_id,
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
  publish_errors: Array<{ id: string; error: string }>;
};

export async function rebuildAndPublish(
  client: WorkerClient,
  options: {
    aliases: AliasTable;
    changed: OfferPayload[];
    pool: OfferPayload[];
    previous: WorkerOfferRow[];
  },
): Promise<RebuildResult> {
  const hardware = await client.listHardware();
  const { proposals } = proposeCandidates(options.pool.map(toMergeOffer), {
    aliases: options.aliases,
    hardware,
  });

  // A change of the unit basis or the pack count always waits for a human.
  const previousById = new Map(options.previous.map((row) => [row.id, row]));
  const poolById = new Map(options.pool.map((offer) => [offerKey(offer), offer]));
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

  const changed = options.changed.map((offer) => {
    const target = canonicalByOffer.get(offerKey(offer));
    return target ? { ...offer, canonical_id: target.canonical_id, bucket_key: target.bucket_key } : offer;
  });

  await client.saveOffers(changed);
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

  return { candidates: proposals.length, published, proposals, publish_errors: publishErrors };
}
