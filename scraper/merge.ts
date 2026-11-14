// Turns the offers of one canonical product into a candidate. The median
// rules, the price outlier gate and the 15% band come from scraper/rules.ts.
// See docs/scraper-design.md sections 2.4, 3.3 and 6.

import { canonicalId, compareIdentity, identityOf } from './identity.ts';
import type { AliasTable, Identity, ProductType } from './identity.ts';
import { PRICE_OUTLIER_SHARE, medianPrice, withinBand } from './rules.ts';

export type MergeOffer = {
  id: string;
  source_site: string;
  source_url: string;
  price: number | null;
  status: string;
  in_stock: string;
  trust_tier: string;
  seller_id: string | null;
  unit_basis: string | null;
  unit_quantity: number | null;
  condition: string;
  stated_specs: Record<string, unknown>;
  last_checked: string | null;
};

export type HardwareRow = {
  id: string;
  type: string;
  price: number | null;
  price_source: string;
  identity_key?: string | null;
};

export type ProvenanceEntry = {
  field: string;
  value: unknown;
  source: string;
  kind: 'stated' | 'datasheet' | 'pool' | 'model_parse' | 'class_derived';
  confidence: 'high' | 'medium' | 'low';
};

export type Proposal = {
  id: string;
  canonical_id: string;
  bucket_key: string;
  current_hardware_row: string | null;
  product_type: ProductType;
  status: 'new' | 'suggested' | 'pending_review';
  proposed_data: Record<string, unknown>;
  proposed_price: number | null;
  current_price: number | null;
  offer_ids: string[];
  source_urls: string[];
  provenance: ProvenanceEntry[];
  low_confidence: boolean;
  risk_flags: string[];
};

export type MergeResult = {
  proposals: Proposal[];
  excluded: Array<{ offer_id: string; reason_code: string }>;
  possible_duplicates: Array<{ left: string; right: string }>;
};

const isQualified = (offer: MergeOffer) =>
  offer.status === 'qualified' &&
  offer.in_stock === 'true' &&
  (offer.unit_basis === 'piece' || offer.unit_basis === 'derived') &&
  offer.condition !== 'used' &&
  offer.condition !== 'foreign_used' &&
  typeof offer.price === 'number' &&
  offer.price > 0;

const trusted = (offer: MergeOffer) => offer.trust_tier === 'verified' || offer.trust_tier === 'established';

const productTypeOf = (specs: Record<string, unknown>): ProductType | null => {
  if (typeof specs.watts === 'number' && typeof specs.voc === 'number') return 'panel';
  if (typeof specs.voltage_v === 'number' && typeof specs.capacity_ah === 'number') return 'battery';
  return null;
};

const PANEL_FIELDS = ['watts', 'voc', 'isc'] as const;
const BATTERY_FIELDS = ['voltage_v', 'capacity_ah', 'battery_type', 'max_parallel_strings', 'min_c_rate'] as const;

// The value for a field comes from the pool of qualified offers. The first
// offer from a trusted seller wins.
function fieldValue(
  field: string,
  offers: MergeOffer[],
): { value: unknown; source: MergeOffer } | null {
  const ordered = [...offers].sort((a, b) => Number(trusted(b)) - Number(trusted(a)));
  for (const offer of ordered) {
    const value = offer.stated_specs[field];
    if (value !== undefined && value !== null && value !== '') return { value, source: offer };
  }
  return null;
}

export function proposeCandidates(
  offers: MergeOffer[],
  options: { aliases: AliasTable; hardware: HardwareRow[] },
): MergeResult {
  const excluded: Array<{ offer_id: string; reason_code: string }> = [];
  const proposals: Proposal[] = [];

  // Group the offers by their identity key.
  const groups = new Map<string, { identity: Identity; offers: MergeOffer[] }>();
  for (const offer of offers) {
    const productType = productTypeOf(offer.stated_specs);
    if (!productType) continue;
    const identity = identityOf(productType, offer.stated_specs, offer.stated_specs.name as string | undefined, options.aliases);
    const existing = groups.get(identity.key);
    if (existing) existing.offers.push(offer);
    else groups.set(identity.key, { identity, offers: [offer] });
  }

  for (const [key, group] of groups) {
    const pool = group.offers.filter(isQualified);

    // The reference median comes from the trusted pool. An offer below 60% of
    // it is a bait or a typo.
    const reference = medianPrice(pool);
    let kept = pool;
    if (reference.price !== null) {
      const floor = reference.price * PRICE_OUTLIER_SHARE;
      const outliers = pool.filter((offer) => (offer.price as number) < floor);
      kept = pool.filter((offer) => !outliers.includes(offer));
      for (const offer of outliers) excluded.push({ offer_id: offer.id, reason_code: 'price_outlier' });
    }

    const median = medianPrice(kept);
    if (median.price === null) continue;

    const productType = group.identity.product_type;
    const fields = productType === 'panel' ? PANEL_FIELDS : BATTERY_FIELDS;
    const provenance: ProvenanceEntry[] = [];
    const proposedData: Record<string, unknown> = {};
    const riskFlags: string[] = [];

    for (const field of fields) {
      const found = fieldValue(field, kept);
      if (!found) {
        riskFlags.push(`missing ${field}`);
        continue;
      }
      proposedData[field] = found.value;
      provenance.push({
        field,
        value: found.value,
        source: found.source.source_site,
        kind: 'stated',
        confidence: 'high',
      });
    }

    const nameOffer = [...kept].sort((a, b) => Number(trusted(b)) - Number(trusted(a)))[0];
    const name = (nameOffer.stated_specs.name as string | undefined) ?? group.identity.brand;
    proposedData.name = name;

    // The battery row uses the shape in src/types.ts.
    if (productType === 'battery') {
      if (proposedData.battery_type !== undefined) {
        proposedData.type = proposedData.battery_type;
        delete proposedData.battery_type;
      }
      if (proposedData.voltage_v !== undefined) {
        proposedData.voltage = proposedData.voltage_v;
        delete proposedData.voltage_v;
      }
    }

    const canonical = canonicalId(group.identity);
    const row =
      options.hardware.find((entry) => entry.id === canonical) ??
      options.hardware.find((entry) => entry.identity_key && entry.identity_key === key) ??
      null;

    const currentPrice = row?.price ?? null;
    const isManual = row?.price_source === 'manual';

    let status: Proposal['status'] = 'new';
    if (row) {
      if (isManual) {
        status = 'pending_review';
        riskFlags.push('manual price');
      } else if (currentPrice !== null && withinBand(median.price, currentPrice)) {
        status = 'suggested';
      } else {
        status = 'pending_review';
        riskFlags.push('price outside the 15% band');
      }
    }
    if (riskFlags.some((flag) => flag.startsWith('missing '))) status = 'pending_review';
    if (median.low_confidence) riskFlags.push('low confidence price');
    if (median.seller_count < 2) riskFlags.push('one seller only');

    proposals.push({
      id: `candidate:${canonical}`,
      canonical_id: canonical,
      bucket_key: group.identity.family_key,
      current_hardware_row: row?.id ?? null,
      product_type: productType,
      status,
      proposed_data: { ...proposedData, price: median.price },
      proposed_price: median.price,
      current_price: currentPrice,
      offer_ids: group.offers.map((offer) => offer.id),
      source_urls: group.offers.map((offer) => offer.source_url),
      provenance,
      low_confidence: median.low_confidence,
      risk_flags: riskFlags,
    });
  }

  // Two groups that share a brand and a family are a possible duplicate. The
  // review screen shows them side by side.
  const possibleDuplicates: Array<{ left: string; right: string }> = [];
  const entries = [...groups.entries()];
  for (let a = 0; a < entries.length; a += 1) {
    for (let b = a + 1; b < entries.length; b += 1) {
      const left = entries[a][1];
      const right = entries[b][1];
      if (compareIdentity(left.identity, right.identity) === 'possible_duplicate') {
        possibleDuplicates.push({ left: entries[a][0], right: entries[b][0] });
      }
    }
  }

  return { proposals, excluded, possible_duplicates: possibleDuplicates };
}
