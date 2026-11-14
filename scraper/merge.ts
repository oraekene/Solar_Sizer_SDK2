// Turns the offers of one canonical product into a candidate. The median
// rules, the price outlier gate and the 15% band come from scraper/rules.ts.
// See docs/scraper-design.md sections 2.4, 3.3 and 6.

import { canonicalId, compareIdentity, identityFromHardwareData, identityOf } from './identity.ts';
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
  trading_signals?: Record<string, unknown>;
  last_checked: string | null;
};

export type HardwareRow = {
  id: string;
  type: string;
  price: number | null;
  price_source: string;
  data?: Record<string, unknown>;
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
  offer.condition !== 'refurbished' &&
  offer.condition !== 'open_box' &&
  typeof offer.price === 'number' &&
  offer.price > 0;

const trusted = (offer: MergeOffer) => offer.trust_tier === 'verified' || offer.trust_tier === 'established';

// The type of an offer comes from the facts that identify it. A panel needs
// its wattage and a battery needs its voltage and its capacity. The other
// values may still be missing at this point.
const productTypeOf = (specs: Record<string, unknown>): ProductType | null => {
  if (typeof specs.voltage_v === 'number' && typeof specs.capacity_ah === 'number') return 'battery';
  if (typeof specs.watts === 'number') return 'panel';
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

// A value read from a listing title is a model parse, so it carries a medium
// confidence. A value from a specification table is stated, so it carries a
// high confidence.
function provenanceKind(offer: MergeOffer): { kind: ProvenanceEntry['kind']; confidence: ProvenanceEntry['confidence'] } {
  return offer.trading_signals?.spec_source === 'model_parse'
    ? { kind: 'model_parse', confidence: 'medium' }
    : { kind: 'stated', confidence: 'high' };
}

// The peer table for a panel wattage. A guessed open-circuit voltage is
// biased upward and a guessed short-circuit current is biased downward, so
// the highest voltage and the lowest current of the peers are used.
type PanelPeers = { vocs: number[]; iscs: number[] };

function peerTable(offers: MergeOffer[]): Map<string, PanelPeers> {
  const table = new Map<string, PanelPeers>();
  for (const offer of offers) {
    if (!isQualified(offer)) continue;
    const watts = offer.stated_specs.watts;
    if (typeof watts !== 'number') continue;
    const peers = table.get(String(watts)) ?? { vocs: [], iscs: [] };
    const voc = offer.stated_specs.voc;
    const isc = offer.stated_specs.isc;
    if (typeof voc === 'number') peers.vocs.push(voc);
    if (typeof isc === 'number') peers.iscs.push(isc);
    table.set(String(watts), peers);
  }
  return table;
}

export function proposeCandidates(
  offers: MergeOffer[],
  options: { aliases: AliasTable; hardware: HardwareRow[] },
): MergeResult {
  const excluded: Array<{ offer_id: string; reason_code: string }> = [];
  const proposals: Proposal[] = [];

  // Group the offers by their family and model. The group key leaves out the
  // facts that only one source states, so two listings of the same panel land
  // in one group even when one of them carries an extra field.
  const groups = new Map<string, { identity: Identity; offers: MergeOffer[] }>();
  for (const offer of offers) {
    const productType = productTypeOf(offer.stated_specs);
    if (!productType) continue;
    const identity = identityOf(productType, offer.stated_specs, offer.stated_specs.name as string | undefined, options.aliases);
    const groupKey = `${identity.family_key}|${identity.model ?? '*'}`;
    const existing = groups.get(groupKey);
    if (existing) existing.offers.push(offer);
    else groups.set(groupKey, { identity, offers: [offer] });
  }

  // The catalogue rows that the scraper can attach to.
  const hardwareIdentities = options.hardware
    .map((row) => ({ row, identity: identityFromHardwareData(row.type, row.data ?? {}, options.aliases) }))
    .filter((entry): entry is { row: HardwareRow; identity: Identity } => entry.identity !== null);

  const peersByWatts = peerTable(offers);

  for (const group of groups.values()) {
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
      const { kind, confidence } = provenanceKind(found.source);
      provenance.push({
        field,
        value: found.value,
        source: found.source.source_site,
        kind,
        confidence,
      });
    }

    // A panel with no stated voltage or current takes the safe value of its
    // peers. The row then carries the estimated-specs marker.
    if (productType === 'panel') {
      const peers = peersByWatts.get(String(group.identity.facts.watts));
      if (peers) {
        if (proposedData.voc === undefined && peers.vocs.length > 0) {
          const voc = Math.max(...peers.vocs);
          proposedData.voc = voc;
          provenance.push({ field: 'voc', value: voc, source: 'peer-pool', kind: 'class_derived', confidence: 'low' });
          const index = riskFlags.indexOf('missing voc');
          if (index >= 0) riskFlags.splice(index, 1);
          riskFlags.push('estimated specs');
        }
        if (proposedData.isc === undefined && peers.iscs.length > 0) {
          const isc = Math.min(...peers.iscs);
          proposedData.isc = isc;
          provenance.push({ field: 'isc', value: isc, source: 'peer-pool', kind: 'class_derived', confidence: 'low' });
          const index = riskFlags.indexOf('missing isc');
          if (index >= 0) riskFlags.splice(index, 1);
          riskFlags.push('estimated specs');
        }
      }
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
      hardwareIdentities.find((entry) => compareIdentity(entry.identity, group.identity) === 'same')?.row ??
      null;

    // A weaker match with a catalogue row never merges on its own. It is
    // flagged so a human decides.
    const duplicateOf = hardwareIdentities.find(
      (entry) => compareIdentity(entry.identity, group.identity) === 'possible_duplicate',
    );

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
    if (duplicateOf) {
      riskFlags.push(`possible duplicate of ${duplicateOf.row.id}`);
      status = 'pending_review';
    }

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
