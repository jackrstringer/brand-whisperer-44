

# Fix: Show All Shopify Products + Handle Pending Images

## Root Cause

The Shopify products exist in the database (20+ products), but most images are stuck in `pending` processing status — they were never classified. The `ShopifyProductGrid` filters out any product without at least one `ready` image, so the grid appears nearly empty.

## Changes

### 1. `ShopifyProductGrid.tsx` — Show all products, not just those with ready images

- Remove the `productsWithImages` filter — show ALL active Shopify products
- For products with only pending images, show a "Processing..." indicator instead of hiding them
- For products with no ready images and only rejected ones, show with a dimmed state and note "No usable images"
- Keep the existing expand/collapse per-product image detail view

### 2. `ShopifyProductGrid.tsx` — Add a "Re-classify" button

- Add a button at the top to trigger re-classification of all pending/unprocessed images for this brand
- Calls the existing `shopify-classify-images` edge function
- This lets the user re-run the classifier with the new stricter logic on images that were either never processed or were processed with the old logic

### 3. `ProductSelector.tsx` — Already correct

- The product selector in the campaign creator already filters to only show products with usable images (via `pickBestImage`). This is the correct behavior for campaign creation — no changes needed here.

## Files Modified

| File | Change |
|------|--------|
| `src/components/brand/ShopifyProductGrid.tsx` | Show all products (pending/rejected/ready), add re-classify button |

