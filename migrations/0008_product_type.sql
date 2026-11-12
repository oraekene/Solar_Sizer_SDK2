-- Admin-chosen catalog bucket. NULL keeps the tag-based classifier in charge.
ALTER TABLE products ADD COLUMN product_type TEXT;
