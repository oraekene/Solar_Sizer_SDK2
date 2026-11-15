-- Store the naira value and the exchange-rate audit fields beside the raw
-- offer price. The raw price and currency never change.
ALTER TABLE hardware_offers ADD COLUMN price_ngn REAL;
ALTER TABLE hardware_offers ADD COLUMN price_ngn_rounded REAL;
ALTER TABLE hardware_offers ADD COLUMN fx_rate REAL;
ALTER TABLE hardware_offers ADD COLUMN fx_rate_date TEXT;
ALTER TABLE hardware_offers ADD COLUMN fx_source TEXT;
