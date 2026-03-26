

# Fix Image Curation: Stricter Filtering + Better Product Selector UI

## Problems

1. **Rescued images still show text** — The rescue concept is fundamentally flawed for most cases. `e-bgremove` removes backgrounds, not text overlays. Smart crop can't reliably remove text that's on top of the product. The AI is marking images as "salvageable" but the ImageKit transforms don't actually fix them. Only `bg_remove` genuinely works — it isolates the product silhouette and discards everything else including text.

2. **Products without usable images still appear** in the campaign creator product selector.

3. **Product selector layout** is a checkbox list — user wants a 3-wide scrollable image grid.

## Changes

### 1. `shopify-classify-images/index.ts` — Tighten rescue logic

The only rescue strategy that reliably removes text is `bg_remove` (and `bg_remove_and_crop`). Smart cropping and directional cropping do NOT remove text overlays — they just crop the frame, which often still leaves text visible.

Changes:
- Only accept rescue strategies `bg_remove` and `bg_remove_and_crop` as valid rescues
- `smart_crop`, `crop_top`, `crop_bottom` → treat as **rejected** (these don't reliably remove text)
- Update the prompt: tell Claude that the ONLY viable rescue is background removal, which isolates the product shape and discards everything else. If text is overlaid directly on the product body itself (not the background), it's NOT salvageable.
- Images where `text_position === "overlay"` (text directly on the product) → always rejected, no rescue possible

### 2. `ShopifyProductGrid.tsx` — Show actual processed images correctly

- For rescued images, display the `processed_url` (with bg-remove transform) as the preview, not the original
- If `processed_url` is already being used (it is), then the issue is the transforms aren't working. Add a note that the grid already uses `processed_url` — the real fix is in the classifier tightening above

### 3. `ProductSelector.tsx` — Hide products without images + grid layout

- Filter `shopifyProducts` to only show products that have at least one usable image (where `pickBestImage` returns non-null)
- Replace the checkbox list layout with a 3-wide scrollable grid showing product images with title overlay
- Clicking a product card toggles selection (highlighted border)
- Search still works, filtering the grid

### 4. `ShopifyProductGrid.tsx` — Hide products without usable images

- In the settings grid view, don't show products that have zero ready images

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/shopify-classify-images/index.ts` | Tighten rescue: only bg_remove works, reject smart_crop/crop strategies |
| `src/components/brand/ProductSelector.tsx` | Hide imageless products, 3-wide scrollable image grid |
| `src/components/brand/ShopifyProductGrid.tsx` | Hide products with no usable images |

