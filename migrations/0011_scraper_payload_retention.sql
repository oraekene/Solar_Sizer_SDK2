-- Keep the capture time of the raw page payload. A failed re-check must not
-- extend the 90-day lifetime of the last successful capture.
ALTER TABLE hardware_offers ADD COLUMN raw_payload_at TEXT;

UPDATE hardware_offers
SET raw_payload_at = COALESCE(scraped_at, created_at)
WHERE raw_payload <> '{}' AND raw_payload_at IS NULL;
