ALTER TABLE shopify_product_images
  ADD COLUMN IF NOT EXISTS has_salvageable_product boolean,
  ADD COLUMN IF NOT EXISTS rescue_strategy text,
  ADD COLUMN IF NOT EXISTS rescue_transforms text;