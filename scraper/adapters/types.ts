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

// One product card on a category page.
export type DiscoveredListing = {
  source_site: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  price: number | null;
  currency: string;
  stock_text: string | null;
  spec_line: string | null;
  pack_count: number | null;
  has_datasheet: boolean;
};

// The result of one page fetch. The status decides whether a listing is gone
// or the site blocked the crawler, because only a gone listing counts as a
// strike.
export type PageResult<T> = {
  value: T | null;
  status: number;
  error?: string;
};

export type SourceAdapter = {
  site: string;
  crawlProduct(url: string): Promise<PageResult<ScraperOffer>>;
  crawlCategory(url: string): Promise<PageResult<DiscoveredListing[]>>;
};

export const CRAWLER_UA = 'SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)';
