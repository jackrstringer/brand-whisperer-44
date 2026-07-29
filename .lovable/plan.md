## What we're building

A third output mode on the campaign editor called **HTML → Image Slices**. The user designs (and the AI generates) an *unrestricted* HTML email — gradients, text over imagery, custom fonts, absolute positioning — then we render it in Chromium, let an AI vision pass carve it into semantic slices (including side-by-side horizontal splits), and push the result to Klaviyo as a native drag-and-drop template made of image blocks. Every slice keeps its clickable link(s); rows with horizontal splits become equal-width columns in a Klaviyo table with no mobile stacking.

The existing **HTML** mode (email-safe, conservative) and **Image Blocks** mode (GPT-Image-2 slices) stay untouched.

## User flow

1. In the campaign editor's Output Format toggle, pick **HTML → Image Slices** (new third pill next to HTML and Image Blocks).
2. Brief the campaign using the exact same sidebar controls as HTML mode (references, products, subject line, extra copy, etc.). Nothing new here.
3. Generation runs the bold-HTML variant of the pipeline, then automatically renders → slices → uploads. Preview shows the stitched slice stack with slice boundaries overlaid; each row displays its href(s).
4. User can regenerate individual slices, edit href per region, or drag boundaries (stretch goal — v1 uses AI-planned boundaries only).
5. "Push to Klaviyo" builds a SYSTEM_DRAGGABLE template of image blocks arranged in rows/columns.

## Pieces to build

### 1. Bold HTML generation prompt
- New prompt track in `supabase/functions/_shared/generateCampaignCore.ts` gated on `campaign.output_format === "html_to_image"`.
- Explicitly permits gradients, text-over-image, absolute positioning, web fonts, oversized type, full-bleed imagery, non-standard layouts.
- Still enforces 600px max width and grounds in brand assets / references exactly like today.
- HTML mode's existing conservative prompt is unchanged.

### 2. Rendering
- Reuse `capture-email-screenshot` (ScreenshotOne, 390px viewport, full-page PNG). No changes needed to that function.

### 3. Semantic slice planner (new edge function `plan-html-slices`)
- Input: rendered PNG + original HTML (for link extraction).
- Uses `google/gemini-3.6-flash` vision to output a slice plan:
  ```
  rows: [
    { y_start, y_end, columns: [{ x_start, x_end, region_label, href? }] }
  ]
  ```
- Each row is a horizontal strip; a row can have 1..N side-by-side columns of equal width (planner is instructed to only split when the design clearly has side-by-side content).
- Link mapping: we parse `<a href>` elements from the HTML with their bounding boxes (via a tiny puppeteer-style pass or by asking the vision model to match visible CTAs to hrefs from a supplied list). The primary href for each region gets attached.

### 4. Cropping (new edge function `crop-html-slices`)
- Takes the full-page PNG + slice plan.
- Crops each `(row, column)` rectangle server-side (using `imagescript` or similar in Deno).
- Uploads each crop to Supabase storage (existing `qa-artifacts` bucket or a new `image-slices` bucket) and returns URLs.

### 5. Data model
Extend `campaigns` (no new table needed — reuses existing `campaign_slices` with one small addition):
- `campaigns.output_format text` — `'html' | 'image' | 'html_to_image'` (default `'html'`).
- `campaign_slices.row_index int`, `campaign_slices.column_index int`, `campaign_slices.columns_in_row int` — to represent horizontal splits. Existing `position` stays as the linear index.
- `campaign_slices.href` already covered by existing `cta_url`.

### 6. Klaviyo push (extend `push-image-email-klaviyo`)
- Group slices by `row_index`.
- Single-column rows → one `image` block full width (as today).
- Multi-column rows → a `row` with `column_layout` matching column count (`"2-columns-equal"`, `"3-columns-equal"`, `"4-columns-equal"`), each column holding one `image` block with its own href. Uses Klaviyo's table structure so columns render side-by-side in both desktop and mobile (no stacking) by setting the row's stacking option off.
- Klaviyo Templates API revision `2026-07-15` already in use.

### 7. Frontend
- `CampaignEditor.tsx`: add third pill to the Output Format toggle. Wire polling and preview for the new mode.
- New `HtmlToImagePreview.tsx`: renders the stitched slice grid with row/column awareness, overlays boundaries, shows href badges, per-slice regenerate / edit-href menu.
- Push button reuses existing Klaviyo action with the extended payload.

## Technical notes

- Models: bold-HTML generation stays on `claude-opus-4-7` (same as HTML mode). Slice planning uses `google/gemini-3.6-flash` vision. No GPT-Image-2 involvement in this mode.
- Rendering viewport stays at 390px so slice math matches what users actually see in Gmail mobile; final Klaviyo images are scaled to 600px column width on push (or we render at 600px if design QA prefers desktop-first — decide during implementation from first end-to-end test).
- Slicing failure mode: if the vision planner returns overlapping or gap-y rectangles, we fail loud (per project rule — no silent fallbacks) and surface the error in the editor.
- Horizontal splits: the planner is instructed that columns in a row must be equal width and share the same y-range. If the design has an unequal split, the planner promotes it to a single full-width slice (safer than distorting Klaviyo columns).
- No changes to HTML mode, Image Blocks mode, flow generation, or QA pipelines.

## Out of scope for v1

- Draggable slice boundaries in the editor.
- Text-selectable regions inside a slice (everything in a slice is one image).
- Dark-mode variants of the sliced images.
