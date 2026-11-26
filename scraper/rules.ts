// The shared scraper rules. The Worker admin routes and the scraper runner
// both import this file, so the reason codes, the statuses and the median
// rules have one home. See docs/scraper-design.md.

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
export function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value / 100) * 100;
}

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
  const rawMedian =
    prices.length % 2 === 1 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const price = roundPrice(rawMedian);

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

// An offer priced below this share of the median is a bait or a typo. The
// threshold is configurable per source.
export const PRICE_OUTLIER_SHARE = 0.6;

// Three genuine not-found checks remove the listing from the catalogue.
export const NOT_FOUND_STRIKES = 3;

// An offer with no successful check for this many days is unverified.
export const UNVERIFIED_AFTER_DAYS = 14;

/** The trust and review numbers, stored in the settings table. */
export type Thresholds = {
  /** A price inside this share of the current price publishes itself. */
  price_band: number;
  /** A price below this share of the median is a bait price. */
  price_outlier_share: number;
  /** The not-found checks that remove a listing. */
  not_found_strikes: number;
  /** The days without a check after which an offer is unverified. */
  unverified_after_days: number;
  /** The Hamming distance at which two image hashes are the same picture. */
  perceptual_hash_distance: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  price_band: 0.15,
  price_outlier_share: PRICE_OUTLIER_SHARE,
  not_found_strikes: NOT_FOUND_STRIKES,
  unverified_after_days: UNVERIFIED_AFTER_DAYS,
  perceptual_hash_distance: 8,
};

/**
 * Reads the stored thresholds over the defaults. A wrong value keeps the
 * default, so a bad setting can never break a run.
 */
export function readThresholds(value: unknown): Thresholds {
  const stored = (value ?? {}) as Record<string, unknown>;
  const pick = (key: keyof Thresholds, min: number, max: number): number => {
    const raw = stored[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_THRESHOLDS[key];
    // A value outside the safe range is a mistake, so the default stays.
    if (raw < min || raw > max) return DEFAULT_THRESHOLDS[key];
    return raw;
  };
  return {
    price_band: pick('price_band', 0.01, 1),
    price_outlier_share: pick('price_outlier_share', 0.05, 1),
    not_found_strikes: Math.round(pick('not_found_strikes', 1, 20)),
    unverified_after_days: Math.round(pick('unverified_after_days', 1, 365)),
    perceptual_hash_distance: Math.round(pick('perceptual_hash_distance', 0, 32)),
  };
}

/** The number of differing bits between two hexadecimal hashes. */
export function hashDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const left = parseInt(a[i], 16);
    const right = parseInt(b[i], 16);
    if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY;
    let bits = left ^ right;
    while (bits) {
      distance += bits & 1;
      bits >>= 1;
    }
  }
  return distance;
}

// A published row must carry every field the calculator reads. A candidate
// that misses one waits for a human instead of going live with a blank value.
export const REQUIRED_SPECS: Record<string, string[]> = {
  panel: ['watts', 'voc', 'isc'],
  battery: ['voltage', 'capacity_ah', 'type', 'max_parallel_strings', 'min_c_rate'],
};

export function missingSpecs(productType: string, data: Record<string, unknown>): string[] {
  const required = REQUIRED_SPECS[productType] ?? [];
  return required.filter((field) => {
    const value = data[field];
    if (typeof value === 'number') return !Number.isFinite(value) || value <= 0;
    return value === undefined || value === null || value === '';
  });
}