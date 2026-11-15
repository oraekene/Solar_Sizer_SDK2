-- Offer price movements keep the quoted currency. Published prices use NGN.
ALTER TABLE price_history ADD COLUMN currency TEXT;
