
ALTER TABLE shopify_product_images
  ADD COLUMN IF NOT EXISTS has_text_overlay boolean,
  ADD COLUMN IF NOT EXISTS is_marketing_collateral boolean,
  ADD COLUMN IF NOT EXISTS is_usable_product_photo boolean;

ALTER TABLE shopify_products
  ADD COLUMN IF NOT EXISTS best_hero_image_id uuid REFERENCES shopify_product_images(id) ON DELETE SET NULL;
