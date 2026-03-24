

# Product Asset Library for Campaign Generation

## What We're Building

A product-level asset management system that lets users define specific products, upload images per product in 3 buckets (Transparent BG, Lifestyle, Misc Hero Shots), and then select which products/images to feature during campaign creation. The AI gets access to all product assets and can transform them (background removal, cropping) via ImageKit when needed.

## Database Changes

### New table: `products`
- `id` (uuid, PK)
- `brand_id` (uuid, FK to brands, cascade delete)
- `name` (text, not null) -- e.g. "Chrome Showerhead"
- `description` (text, nullable) -- brief product description
- `created_at` (timestamptz)

RLS: same pattern as brand_assets (user owns the parent brand).

### New table: `product_assets`
- `id` (uuid, PK)
- `product_id` (uuid, FK to products, cascade delete)
- `brand_id` (uuid, FK to brands, cascade delete) -- denormalized for easier querying
- `bucket` (text, not null) -- one of: `transparent_bg`, `lifestyle`, `hero_shots`
- `url` (text, not null)
- `filename` (text, nullable)
- `description` (text, nullable) -- AI-generated
- `dominant_colors` (text[], nullable)
- `ai_category` (text, nullable)
- `composition_notes` (text, nullable)
- `transparent_bg` (boolean, default false) -- AI-detected
- `created_at` (timestamptz)

RLS: same brand-ownership pattern.

## UI Changes

### 1. CampaignEditor.tsx -- Product Selection Submenu

In the draft panel (right side, before the Generate button), add a collapsible "Products" section:

- **Collapsed state**: "Products (optional)" header with chevron
- **Expanded state**:
  - Dropdown/multi-select of existing products for this brand
  - "Add New Product" button that opens an inline form:
    - Product name input
    - 3 upload zones (Transparent BG PNGs, Lifestyle, Misc Hero Shots) using the existing ResourceUploader pattern
    - Each upload triggers fire-and-forget `analyze-asset` call, writes to `product_assets`
    - Save button creates the product record + assets
  - Once products are selected, show thumbnails of their assets
  - Optional: click individual images to pin specific ones as "must use"

- Pass `selectedProductIds` and optionally `pinnedAssetUrls` to the `generate-campaign` call

### 2. New Component: `ProductSelector.tsx`

Handles:
- Fetching products for a brand
- Multi-select with thumbnails
- "Add Product" inline flow with 3-bucket upload
- Individual image pinning (click to select specific images)

### 3. New Component: `ProductCreator.tsx`

Inline form for creating a new product:
- Name input
- 3 ResourceUploader instances for the 3 buckets
- On save: creates product row, uploads files to `brand-assets` storage bucket under `{brandId}/products/{productId}/{bucket}/`, inserts `product_assets` rows, fires off `analyze-asset` for each

## Edge Function Changes

### `generate-campaign/index.ts`

Accept new params: `productIds?: string[]`, `pinnedAssetUrls?: string[]`

When products are specified:
1. Fetch `product_assets` for the given product IDs
2. Fetch parent `products` for names/descriptions
3. Build a `FEATURED PRODUCTS` section in the prompt:
   - Product name + description
   - Available images per product with AI descriptions
   - If user pinned specific images, mark them as "MUST USE"
4. Add instruction: "If no transparent-background image exists for a product but one is needed, you may append ImageKit bg-removal transform `?tr=bg-remove` to any product image URL."
5. The existing brand-level asset catalog remains available as supplementary

### `analyze-asset/index.ts`

No changes needed -- already handles all the metadata we need. The `transparent_bg` field is already returned and will be stored in `product_assets`.

## ImageKit Transforms Available to AI

Add to the prompt instructions that the AI can append these ImageKit URL transforms when needed:
- `?tr=bg-remove` -- remove background (for when user only uploaded non-transparent images)
- Standard width/height transforms already exist in `_shared/imagekit.ts`

No destructive auto-cropping. The AI chooses what to do based on composition notes in the asset metadata.

## Files to Create/Modify

1. **Database migration** -- Create `products` and `product_assets` tables with RLS
2. **`src/components/brand/ProductSelector.tsx`** -- New: product multi-select + image pinning
3. **`src/components/brand/ProductCreator.tsx`** -- New: inline product creation with 3-bucket uploads
4. **`src/pages/CampaignEditor.tsx`** -- Add collapsible Products section in draft panel, pass product data to generate call
5. **`supabase/functions/generate-campaign/index.ts`** -- Accept product IDs, fetch product assets, build product-specific prompt sections
6. **`src/lib/types.ts`** -- Add Product and ProductAsset interfaces

## Flow Summary

```text
Campaign Brief Panel
  |
  +-- Products (collapsible)
  |     +-- [Select existing products] (multi-select dropdown)
  |     +-- [+ Add New Product]
  |     |     +-- Name: "Chrome Showerhead"
  |     |     +-- Transparent BG: [upload zone]
  |     |     +-- Lifestyle: [upload zone]
  |     |     +-- Hero Shots: [upload zone]
  |     |     +-- [Save Product]
  |     +-- Selected product thumbnails
  |     +-- (click individual images to pin as "must use")
  |
  +-- Brief textarea
  +-- Goal selector
  +-- Speed mode
  +-- [Generate Campaign]
```

