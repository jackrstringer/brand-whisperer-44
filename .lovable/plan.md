# Blocklab pipeline port + Block Export mode

Rebuild image-mode generation around Blocklab's 6-stage architecture, and add a new lightweight "Block Export" mode that generates standalone PNG blocks for Figma.

## Part 1 — Rebuild image-mode generation (Blocklab port)

### Stage 1: Planning (single Opus 4.7 call)
Rewrite `plan-image-email/index.ts`:
- Consolidate all planning into ONE Opus call that produces both the **design system** and the **block plan** (already the case) but with a much richer contract:
  - Load client voice + past headline examples (from `brand_intelligence.compiled_context` + prior campaign copy).
  - Load `identity_locked` fields: canonical CTA label/shape/radius, accent color, type system — pulled from brand profile. These CANNOT be overridden by the brief.
  - Copy ceilings baked into the prompt (headline / subhead / body word caps, banned phrases, narrative-arc requirement).
  - Campaign completeness checklist: wordmark once at top, ≥3 CTAs, canonical CTA label, footer rule, no dead blocks.
  - Output includes per-block: `id`, `archetype`, `size`, `product_asset_key(s)` (1–3, planner-directed), `composition`, `devices[]`, `brief`, `copy` (headline/sub/body/cta).
- **Post-plan code repairs** (no model): append canonical button geometry string (fixed px/radius) to every block's brief; fix composition/device namespace collisions.

### Stage 2: Brand file synthesis
New shared module `supabase/functions/_shared/brandFile.ts`:
- Builds an in-memory brand pack per campaign: palette, up to N identity images (product cutouts from `brand_assets` + `product_assets`), style reference images (prior campaign renders from `reference_campaigns` filtered by brand affinity), scene asset map keyed by filename stem.
- Cached in the campaign row so slice regen doesn't rebuild it.

### Stage 3: Generation (per-block, parallel)
Rewrite `generate-slice/index.ts`:
- Switch from `/v1/images/generations` to **`/v1/images/edits`** with `openai/gpt-image-2`, attaching:
  - 1–3 planner-selected brand assets (product cutouts + optional logo/lifestyle).
  - Style reference images (2–3 past campaigns).
  - Prompt with 7 sections: universal rules, brand facts, block type, brief, canvas/continuity string, construction spec, attachment note ("reproduce these exact photographs, do not reimagine").
- **Retry loop** (2 attempts): missed blocks retried; on attempt 2, if still failed (moderation), call Claude Sonnet to fully rewrite the brief stripping scene description, then fall back to product-cutout composition.

### Stage 4: Trim
New `supabase/functions/_shared/trimSlice.ts`:
- Detects dead surface rows (uniform background) at top/bottom of each generated PNG and crops them. Never scales — fixed column width, variable height.

### Stage 5: Stack (client-side, already exists)
Keep the current stitched preview. Append real footer PNG if brand has one; never generate a footer.

### Stage 6: Whole-campaign QA (single Opus 4.7 vision call)
Rewrite `qa-campaign/index.ts` for image-mode:
- Input: stacked email PNG + labeled side-by-side strip of blocks + plan (briefs stripped).
- 14-point rubric: copy arc, CTA consistency, type scale, product drift, alignment, wordmark placement, dead gaps, seams, legibility, palette adherence, mobile fit, hierarchy, continuity, footer.
- Returns verdict `ship | fix_then_ship | regenerate` + per-block `action` + `brief_edit`.
- **One auto-apply pass**: regenerate only flagged blocks with QA's brief_edit appended, re-trim those blocks, restack. No re-check loop.

### Editor UX changes (`CampaignEditor.tsx`)
- Show QA verdict badge + per-block findings once QA completes.
- "Regenerate flagged" button re-runs the QA apply pass on-demand.
- Progress indicator shows: Planning → Brand file → Generating (X/N) → Trim → QA → Ready.

## Part 2 — Block Export mode

New campaign generation mode `mode: "block_export"` (alongside `html` and `image`).

### Flow
1. User picks brand + one reference campaign + block count + brief.
2. Runs Stage 1 (planning) and Stage 3 (per-block generation) only — **no stitching, no QA, no trim**.
3. Each block appears as an independent PNG card in the editor.
4. Per-block actions: Regenerate, Edit brief, **Download PNG**, **Download all as ZIP**.

### UI
- New segmented option "Block Export" in the Output Format toggle already in `CampaignEditor.tsx`.
- Grid layout (not stacked) for generated blocks.
- ZIP download built client-side with `jszip`.

## Technical details

### DB migration
- Add `campaigns.mode` values: extend to `'block_export'` alongside existing `html`/`image` values (currently `generation_mode` column).
- Add `campaigns.brand_file jsonb` to cache Stage 2 output.
- Add `campaign_slices.qa_finding jsonb` (action + brief_edit from last QA pass).
- Add `campaign_slices.qa_regenerated_at timestamptz`.

### Edge functions touched
- `plan-image-email` — rewritten with richer contract, identity_locked, checklist.
- `generate-slice` — switched to `/v1/images/edits`, retry loop, moderation fallback via Claude.
- `qa-campaign` — rewritten for image-mode 14-point rubric + auto-apply.
- New `_shared/brandFile.ts`, `_shared/trimSlice.ts`, `_shared/imageEditsClient.ts`.

### Frontend
- `CampaignEditor.tsx` — Output Format toggle gets 3 options; QA verdict panel; block-grid vs stitched-preview branching.
- `SliceInspector` — expose QA finding, per-block download.
- New `src/lib/blockExport.ts` — ZIP builder.

### Models
- Planning + QA: `openai/gpt-5.5-pro` (Opus 4.7 equivalent — confirm from catalog before wiring).
- Image gen: `openai/gpt-image-2` via `/v1/images/edits`.
- Moderation-fallback brief rewrite: `google/gemini-3.6-flash`.

### Known limits carried over from Blocklab
- QA is one auto-apply pass, not iterative.
- No cross-campaign block cache.
- Timing: 3-block ~6 min; 5–6 block with moderation retries can hit 45+ min. Block count is the biggest speed lever.

## Out of scope
- Iterative QA loop
- Figma plugin (export produces raw PNGs only)
- Cross-campaign block reuse/caching
