

# Plan: Fix Flow Email Generation Pipeline

## Summary
Six changes to fix trigger product vs. product feed confusion, correct Liquid syntax, slim down the flow system prompt, and fix TypeScript build errors across edge functions.

## Technical Details

### Change 1: New `KLAVIYO_FLOW_LIQUID_REFERENCE` export in `klaviyoBestPractices.ts`
Add a new export at the end of the file containing only:
- **Section 2** (lines 761-1073): Liquid Templating Best Practices (2.1-2.9)
- **Section 9** (lines 2191-2217): Catalog Lookup — but fix syntax: `{% catalog_lookup ... as catalog_item %}` → `{% catalog item_id %}...{% endcatalog %}`, `catalog_item.image_full_url` → `catalog_item.featured_image.full.src`, prices use `{% currency_format catalog_item.metadata|lookup:"$price" %}`
- **Section 10** (lines 2219-2262): Product Feeds — same catalog syntax fix inside feed loops
- **Section 11** (lines 2264-2291): Person Properties — as-is
- **Section 12** (lines 2293-2348): Email Structure Templates — as-is

Sections 1, 3-8 are excluded. Original `KLAVIYO_BEST_PRACTICES` export untouched.

### Change 2: Replace flow mode system prompt in `generateCampaignCore.ts`
- Add import of `KLAVIYO_FLOW_LIQUID_REFERENCE` from klaviyoBestPractices.ts (line 7)
- Replace lines 959-970 with the new system prompt that uses `KLAVIYO_FLOW_LIQUID_REFERENCE` instead of full `KLAVIYO_BEST_PRACTICES`
- Key differences: says "flow email templates" not "transactional", specifies non-empty default rule, mentions Django vs Shopify Liquid, references the new slim export

### Change 3: Replace hardcoded Shopify paths with trigger-aware context
- Replace lines 1138-1160 (the `flowDetails` block with hardcoded `event.extra.line_items` paths)
- Read `flowConfig.trigger_metric_name` to determine trigger type
- Inject trigger-specific guidance:
  - **Viewed Product**: ONE product, no items array, top-level keys, extra grids = product feed, MARKETING
  - **Started Checkout / Checkout Started**: Cart items in Items[] or extra.line_items[], additional grids = product feed, MARKETING
  - **Placed Order / Ordered Product**: Order items + metadata, additional grids = cross-sell feed, TRANSACTIONAL
  - **Fulfilled Order**: Tracking in fulfillments array, TRANSACTIONAL
  - **Default**: Generic "read the JSON carefully"
- After trigger context, include event JSON with universal rules (use exact paths, | default: with non-empty fallback, no $-prefixed keys)
- Remove ALL hardcoded lines like "Line items loop: {%- for line_item in event.extra.line_items -%}" etc.

### Change 4: Fix Liquid syntax in productFeedsBlock
- In `generateCampaignCore.ts` lines 1014-1024, replace:
  - `{%- catalog_lookup item.item_id as catalog_item -%}` → `{%- catalog item.item_id -%}...{%- endcatalog -%}`
  - `catalog_item.image_full_url` → `catalog_item.featured_image.full.src`
  - Price: use `{% currency_format catalog_item.metadata|lookup:"$price" %}`

### Change 5: Fix Liquid syntax in `analyze-reference-for-flow/index.ts`
- Update system prompt and any example text to use `{% catalog %}...{% endcatalog %}` instead of `catalog_lookup`

### Change 6: Fix 11 TypeScript build errors
All are simple type annotation fixes:
- **analyze-asset/index.ts:117** — `(err)` → `(err: any)`
- **analyze-klaviyo-performance/index.ts:85** — `(ch)` → `(ch: string)`
- **klaviyo-quick-stats/index.ts:176** — `e.message` → `(e as any).message`
- **refine-brand/index.ts:79** — `err.message` → `(err as any).message`
- **research-brand/index.ts:259** — `EdgeRuntime.waitUntil` → `(globalThis as any).EdgeRuntime.waitUntil`
- **shopify-classify-images/index.ts:268** — `error.message` → `(error as any).message`
- **shopify-install/index.ts:37** — `error.message` → `(error as any).message`
- **shopify-sync-products/index.ts:78,152,153** — Add explicit type annotations: `const resp: Response = ...`, `const linkHeader: string | null = ...`, `const nextMatch: RegExpMatchArray | null = ...`
- **shopify-sync-products/index.ts:180** — `error.message` → `(error as any).message`

## What is NOT changing
- Reference image fetching / skeleton extraction
- analyze-reference-for-flow core logic (only prompt text fix)
- Product feeds fetch/caching
- Brand assets, brand rules, design notes injection
- QA pass logic
- Standard (non-flow) campaign generation mode
- The original `KLAVIYO_BEST_PRACTICES` export

## Files Modified
1. `supabase/functions/_shared/klaviyoBestPractices.ts` — new export
2. `supabase/functions/_shared/generateCampaignCore.ts` — changes 2, 3, 4
3. `supabase/functions/analyze-reference-for-flow/index.ts` — change 5
4. `supabase/functions/analyze-asset/index.ts` — TS fix
5. `supabase/functions/analyze-klaviyo-performance/index.ts` — TS fix
6. `supabase/functions/klaviyo-quick-stats/index.ts` — TS fix
7. `supabase/functions/refine-brand/index.ts` — TS fix
8. `supabase/functions/research-brand/index.ts` — TS fix
9. `supabase/functions/shopify-classify-images/index.ts` — TS fix
10. `supabase/functions/shopify-install/index.ts` — TS fix
11. `supabase/functions/shopify-sync-products/index.ts` — TS fix

