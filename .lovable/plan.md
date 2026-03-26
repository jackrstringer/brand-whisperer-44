

# Smart Image Curation for Shopify Product Sync

## Problem

Shopify stores (especially those selling on Amazon) often have A+ content / listicle / carousel images mixed in with actual product photos. The current classifier treats all images equally and marks everything as "ready." The screenshot shows the issue: images with text overlays, benefit callouts, and testimonial graphics are all classified alongside clean product shots.

## Solution

Two changes: (1) upgrade the classification prompt to detect and reject non-product images, and (2) add a post-classification curation step that ensures each product has at least one clean hero shot.

---

## Changes

### 1. `shopify-classify-images/index.ts` — Smarter classification prompt

Expand the classification prompt with new fields and stricter rules:

- Add `has_text_overlay: boolean` — true if the image contains marketing text, benefit callouts, testimonials, price tags, or any overlaid typography
- Add `has_icons_or_graphics: boolean` — true if the image contains icons, badges, infographics, or graphic design elements layered on top
- Add `is_marketing_collateral: boolean` — true if this is a carousel ad, A+ content panel, listicle graphic, or comparison chart rather than a photograph
- Add `is_usable_product_photo: boolean` — the final verdict: true ONLY if the image is a genuine product photograph with no text, no icons, no graphic overlays

Update the system prompt to instruct the AI:
> "Images with ANY text overlay, marketing copy, testimonial quotes, benefit callouts, comparison charts, or graphic design elements are NOT usable product photos. These are marketing collateral. Only clean photographs of the product — with or without models, with or without backgrounds — qualify as usable product photos."

Update the save logic:
- Set `processing_status = "rejected"` for images where `is_usable_product_photo === false`
- Only images with `is_usable_product_photo === true` get `processing_status = "ready"`

Add a new DB column via migration: `is_usable_product_photo boolean`, `has_text_overlay boolean`, `is_marketing_collateral boolean`

### 2. `shopify-classify-images/index.ts` — Post-classification curation

After all images for a product are classified, run a per-product curation check:

- Count how many "ready" images each product has
- If a product has zero ready images with `image_type = "product_isolated"`, check if any rejected images could work with heavy cropping (log a warning but don't auto-recover)
- If a product has ready images but none with a clean/transparent background, auto-apply `?tr=bg-remove` to the best `product_isolated` or `product_detail` image and save as `processed_url`
- Store a `best_hero_image_id` reference on the `shopify_products` table so the selector doesn't need to recompute every time

New DB column on `shopify_products`: `best_hero_image_id uuid references shopify_product_images(id)`

### 3. `ShopifyProductGrid.tsx` — Show rejected vs ready distinction

- Filter out rejected images by default (show "X of Y images usable" count)
- Add a toggle: "Show rejected images" that reveals them grayed out with a "Marketing collateral" or "Has text overlay" reason badge
- Ready images show with a green checkmark; rejected show with a strikethrough overlay

### 4. `ProductSelector.tsx` — Use best_hero_image_id

- Update `pickBestImage` to prefer the product's `best_hero_image_id` if set
- Filter out images where `is_usable_product_photo !== true` from the selection pool entirely

---

## Database Migration

```sql
-- Add curation columns to shopify_product_images
ALTER TABLE shopify_product_images
  ADD COLUMN IF NOT EXISTS has_text_overlay boolean,
  ADD COLUMN IF NOT EXISTS is_marketing_collateral boolean,
  ADD COLUMN IF NOT EXISTS is_usable_product_photo boolean;

-- Add best hero reference to shopify_products
ALTER TABLE shopify_products
  ADD COLUMN IF NOT EXISTS best_hero_image_id uuid REFERENCES shopify_product_images(id) ON DELETE SET NULL;
```

---

## Files Modified

| File | Change |
|------|--------|
| Migration SQL | Add 4 columns across 2 tables |
| `supabase/functions/shopify-classify-images/index.ts` | Expanded prompt, rejection logic, post-classification curation |
| `src/components/brand/ShopifyProductGrid.tsx` | Rejected image filtering + toggle |
| `src/components/brand/ProductSelector.tsx` | Filter non-usable images, use best_hero_image_id |

