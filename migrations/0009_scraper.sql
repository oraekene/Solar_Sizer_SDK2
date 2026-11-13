-- Hardware scraper, phase one. See docs/scraper-design.md.
--
-- The archive is not a separate table. Every ad the scraper ever sees lives in
-- hardware_offers, and an excluded ad is a row with status = 'excluded' and a
-- reason_code. Nothing is deleted, so an archived ad can be promoted without a
-- new fetch. Section 2.3 of the design doc said "also written to an archive
-- table"; this file stores the same records in one place instead.

-- Existing rows are manual rows. They keep their price until an admin accepts
-- a scraped median.
ALTER TABLE hardware ADD COLUMN price_source TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS hardware_offers (
  id TEXT PRIMARY KEY,
  canonical_id TEXT,
  bucket_key TEXT,
  source_site TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_listing_id TEXT NOT NULL,
  seller_id TEXT,
  seller_name TEXT,
  price REAL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  price_kind TEXT NOT NULL DEFAULT 'cash',
  unit_basis TEXT,
  unit_quantity REAL,
  condition TEXT NOT NULL DEFAULT 'unknown',
  in_stock TEXT NOT NULL DEFAULT 'unknown',
  trust_tier TEXT NOT NULL DEFAULT 'unknown',
  stated_specs TEXT NOT NULL DEFAULT '{}',
  trading_signals TEXT NOT NULL DEFAULT '{}',
  raw_payload TEXT NOT NULL DEFAULT '{}',
  image_hash TEXT,
  status TEXT NOT NULL DEFAULT 'review_required',
  reason_code TEXT,
  not_found_strikes INTEGER NOT NULL DEFAULT 0,
  last_checked TEXT,
  scraped_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_site, source_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_offers_canonical ON hardware_offers(canonical_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON hardware_offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_reason ON hardware_offers(reason_code);
CREATE INDEX IF NOT EXISTS idx_offers_seller ON hardware_offers(seller_id);
CREATE INDEX IF NOT EXISTS idx_offers_bucket ON hardware_offers(bucket_key);
CREATE INDEX IF NOT EXISTS idx_offers_image_hash ON hardware_offers(image_hash);
CREATE INDEX IF NOT EXISTS idx_offers_last_checked ON hardware_offers(last_checked);

CREATE TABLE IF NOT EXISTS hardware_candidates (
  id TEXT PRIMARY KEY,
  canonical_id TEXT,
  bucket_key TEXT,
  current_hardware_row TEXT,
  product_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  proposed_data TEXT NOT NULL DEFAULT '{}',
  proposed_price REAL,
  current_price REAL,
  offer_ids TEXT NOT NULL DEFAULT '[]',
  source_urls TEXT NOT NULL DEFAULT '[]',
  provenance TEXT NOT NULL DEFAULT '[]',
  rejected_with_reason TEXT,
  reviewer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  published_hardware_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidates_status ON hardware_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_canonical ON hardware_candidates(canonical_id);
CREATE INDEX IF NOT EXISTS idx_candidates_created ON hardware_candidates(created_at);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hardware_row_id TEXT NOT NULL,
  price REAL NOT NULL,
  median_at_publish REAL,
  reason TEXT NOT NULL DEFAULT 'publish',
  date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_history_row ON price_history(hardware_row_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);

CREATE TABLE IF NOT EXISTS run_report (
  run_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'sweep',
  status TEXT NOT NULL DEFAULT 'ok',
  sources TEXT NOT NULL DEFAULT '[]',
  report TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_report_started ON run_report(started_at);

-- Images waiting for OCR or a vision model. The drainer on the always-on host
-- reads this table through the Worker, so the queue never needs a path into the
-- host.
CREATE TABLE IF NOT EXISTS scraper_queue (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  image_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON scraper_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_offer ON scraper_queue(offer_id);
