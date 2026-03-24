
## What’s actually failing (from current code + live data)

1. **Product selection is reaching backend correctly**  
   The generation request includes `productIds` (confirmed in network logs), so this is **not** a UI selection bug.

2. **Product images are getting dropped in generation output**  
   For recent campaigns generated with selected products, stored HTML contains **zero** `/products/` image URLs.  
   Root issue in `generate-campaign/index.ts`:
   - Pass 1 prompt has conflicting wording (“use AVAILABLE BRAND ASSETS”) even when product assets are separately provided.
   - Pass 2 QA only receives/whitelists **brand asset catalog**, not product assets, so product URLs are treated as invalid and removed/replaced.

3. **Bottom clipping is primarily from truncated HTML being saved**  
   Recent generated campaigns in DB are missing `</body>` and `</html>`.  
   Current function accepts QA output if it merely contains `<table>` and length > 100, so truncated responses still get persisted.

---

## Implementation plan

### 1) Fix product imagery enforcement in `supabase/functions/generate-campaign/index.ts`
- Build a unified `approvedAssetCatalog` = **brand assets + selected product assets**.
- Rewrite image rules so they reference **approved assets** (not “brand assets only”).
- Keep product block as hard requirement:
  - If product selected and has assets, campaign must include at least one image URL from that product.
- Add deterministic post-generation checks:
  - Extract all `<img src>` URLs.
  - Validate selected products each appear at least once (when assets exist).

### 2) Fix QA pass so it doesn’t remove product imagery
- Update QA input text to include product asset URLs and product-level requirements.
- Update QA rule language from “brand asset catalog” to “approved catalog”.
- Only accept QA output when all are true:
  - structurally complete HTML,
  - product-image requirement still satisfied,
  - no disallowed image hosts.
- If QA output fails checks, keep Pass 1 HTML instead of overwriting it.

### 3) Prevent clipped/incomplete campaigns from being saved
- Add `isCompleteHtml()` guard (doctype/html/body close tags + basic validity checks).
- Read Anthropic `stop_reason` and treat `max_tokens` (or incomplete structure) as truncation risk.
- Recovery flow:
  - If Pass 1 incomplete: retry once with a concise-generation instruction (fewer sections/leaner markup).
  - If QA incomplete: discard QA output and use validated Pass 1.
- Never persist incomplete HTML as `ready`; mark error with actionable message if no valid HTML obtained.

### 4) Harden the editor preview against visual clipping (`src/pages/CampaignEditor.tsx`)
- Improve iframe height syncing:
  - re-measure on iframe load,
  - re-measure after image loads inside iframe,
  - attach a `ResizeObserver`/mutation-driven remeasure loop with debounce.
- Remove/adjust hard clipping behavior from the preview wrapper so delayed image loads don’t visually cut bottom content.

### 5) Consistency hardening (same rule in edits)
- Apply the same “approved catalog includes product assets” rule in `supabase/functions/edit-campaign/index.ts` so chat edits don’t later strip product imagery.

---

## Files to change
1. `supabase/functions/generate-campaign/index.ts` (primary fix: prompt + QA + validation + truncation guards)  
2. `src/pages/CampaignEditor.tsx` (preview height/clipping resilience)  
3. `supabase/functions/edit-campaign/index.ts` (catalog consistency for post-generation edits)

---

## Verification plan
1. Generate campaign with one selected product (no pinned images), only lifestyle bucket populated.  
   - Confirm final HTML contains at least one `/products/{product_id}/...` URL.
2. Confirm generated HTML always ends with valid closing tags (`</body></html>`).
3. Scroll preview to bottom and verify footer/content are fully visible (no visual cut-off).
4. Repeat in Normal + Fast modes.
5. Run one chat edit on that campaign and verify product image remains allowed/retained.
