-- Internet device traits shown in the dedicated details modal.
-- ALTER TABLE ADD COLUMN is not idempotent in D1; run once.
ALTER TABLE devices_master ADD COLUMN specs TEXT NOT NULL DEFAULT '{}';
