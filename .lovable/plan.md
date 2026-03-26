

# Shopify Product Sync Integration

This is a custom Shopify integration for importing product imagery into the brand asset library — not for selling products, so the built-in Lovable Shopify connector does not apply here.

---

## Scope

3 new database tables, 4 new edge functions, UI additions to Brand Settings and Campaign Editor. Requires two new secrets (SHOPIFY_API_KEY, SHOPIFY_API_SECRET).

---

## Phase 1: Database

Create tables with RLS (users can only access data for brands they own):

**shopify_connections** — stores OAuth tokens per brand
- id, brand_id, shop_domain, access_token (encrypted), scope, connected_at, last_synced_at

**shopify_products** — synced product catalog
- id, brand_id, shopify_product_id, title, handle, product_type, tags[], variants (jsonb), status, shopify_updated_at, synced_at

**shopify_product_images** — per-image with AI classification
- id, brand_id, product_id (FK → shopify_products), shopify_image_id, original_url, imagekit_url, processed_url
- Classification fields: image_type, has_white_bg, has_transparent_bg, background_type, subject_description, variant_shown, dominant_colors[], usable_as_hero, usable_as_product_shot, confidence, processing_status, classified_at

RLS policies mirror existing pattern: `EXISTS (SELECT 1 FROM brands WHERE brands.id = X.brand_id AND brands.user_id = auth.uid())`.

---

## Phase 2: Secrets

Request SHOPIFY_API_KEY and SHOPIFY_API_SECRET from user (obtained from Shopify Partner Dashboard app credentials).

---

## Phase 3: Edge Functions

**shopify-install** — generates OAuth install URL
- Input: `{ brandId, shopDomain }`
- Returns: `{ installUrl }` pointing to Shopify's OAuth authorize endpoint

**shopify-connect** — OAuth callback handler
- Verifies HMAC, exchanges code for access_token
- Saves to shopify_connections
- Triggers initial sync

**shopify-sync-products** — fetches all products + images via Shopify REST API
- Paginates through `GET /admin/api/2024-01/products.json`
- Upserts shopify_products and shopify_product_images
- Rehosts images to ImageKit using existing `_shared/imagekit.ts`
- Triggers classification for pending images

**shopify-classify-images** — Claude vision classification + ImageKit bg-remove
- Processes pending images in batches of 10
- Classifies each image (type, background, usability, colors)
- If `background_removal_recommended`: sets `processed_url = imagekit_url + "?tr=bg-remove"`
- Updates processing_status to 'ready' or 'failed'

---

## Phase 4: UI Changes

**Brand Settings — new "Shopify" tab:**
- Not connected: shop domain input + "Connect Shopify" button → calls shopify-install → redirects to Shopify OAuth
- Connected: shop domain display, last synced time, product/image counts, "Sync Now" button, "Disconnect" button

**Brand Settings — Products tab enhancement:**
- Show Shopify-synced products alongside manual products
- Each product card shows image count, processing status badge, first ready thumbnail
- Expandable image grid with type badges, descriptions, original/processed toggle

**Campaign Editor — ProductSelector upgrade:**
- If brand has Shopify connection + synced products: show searchable product dropdown with thumbnails
- Auto-select best image per product (transparent > white bg > lifestyle hero > fallback)
- User can manually swap images from product's image grid
- Falls back to existing manual ProductSelector if no Shopify connection

**Campaign generation payload:**
- Pass `selected_products[]` with title, description, image_url, image_type, variant
- Inject product image mandate into generate-campaign prompt

---

## Files Created/Modified

| File | Action |
|------|--------|
| Migration SQL | Create 3 tables + RLS |
| `supabase/functions/shopify-install/index.ts` | New |
| `supabase/functions/shopify-connect/index.ts` | New |
| `supabase/functions/shopify-sync-products/index.ts` | New |
| `supabase/functions/shopify-classify-images/index.ts` | New |
| `src/components/brand/ShopifySetup.tsx` | New — settings UI |
| `src/components/brand/ShopifyProductGrid.tsx` | New — product/image browser |
| `src/components/brand/ProductSelector.tsx` | Modified — Shopify-aware selection |
| `src/pages/BrandSettings.tsx` | Modified — add Shopify tab |
| `src/pages/CampaignEditor.tsx` | Modified — pass Shopify product data to generation |
| `supabase/functions/generate-campaign/index.ts` | Modified — handle selected_products in prompt |

---

## Implementation Order

1. Database migration (3 tables + RLS)
2. Request SHOPIFY_API_KEY + SHOPIFY_API_SECRET secrets
3. shopify-install + shopify-connect edge functions
4. shopify-sync-products edge function
5. shopify-classify-images edge function
6. ShopifySetup component + BrandSettings tab
7. ShopifyProductGrid component
8. ProductSelector Shopify-aware upgrade
9. Campaign generation payload wiring

