-- The trust and review numbers move into the settings table, so the owner can
-- change them without a deploy. The code keeps the same defaults.
INSERT INTO settings (key, value, updated_at)
VALUES (
  'scraper_thresholds',
  '{"price_band":0.15,"price_outlier_share":0.6,"not_found_strikes":3,"unverified_after_days":14,"perceptual_hash_distance":8}',
  datetime('now')
)
ON CONFLICT(key) DO NOTHING;

-- The perceptual hash and a small thumbnail for each offer image. The hash
-- collapses a re-encoded copy of one photo, and the thumbnail gives the
-- review screen a small picture.
ALTER TABLE hardware_offers ADD COLUMN image_phash TEXT;
ALTER TABLE hardware_offers ADD COLUMN image_thumb TEXT;

-- The internet device prices that had no catalogue row behind them.
UPDATE devices_master SET price = 35000   WHERE id = 'd5';  -- Wi-Fi Router
UPDATE devices_master SET price = 65000   WHERE id = 'd17'; -- Cudy LT700
UPDATE devices_master SET price = 1200000 WHERE id = 'd20'; -- Starlink Gen 2
UPDATE devices_master SET price = 1800000 WHERE id = 'd21'; -- Starlink Gen 3

-- The seeded duplicate internet products now live in the Internet Devices row
-- of the Hardware DB, so these copies that sat in no tab are removed.
DELETE FROM products WHERE id IN ('p_int_1', 'p_int_4', 'p_h_7', 'p_h_8');
