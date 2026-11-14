// Shared types for the source adapters. The field names match the Worker
// admin route in worker/scraper.ts, so an adapter output posts directly.

export type InStock = 'true' | 'false' | 'unknown';
export type TrustTier = 'verified' | 'established' | 'unknown';
export type OfferStatus = 'qualified' | 'excluded' | 'review_required';

export type ScraperOffer = {
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
  in_stock: InStock;
  trust_tier: TrustTier;
  stated_specs: Record<string, unknown>;
  trading_signals: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  status: OfferStatus;
  reason_code: string | null;
  last_checked: string;
  scraped_at: string;
};

export const CRAWLER_UA = 'SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)';
