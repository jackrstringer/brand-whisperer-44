
Summary

This is not a preview-only issue. The saved campaign HTML is already corrupted before rendering. The regression is coming from the deterministic post-processing layer, not from the model “being creative.”

Why this is happening

- `normalizeGridImages.ts` is misidentifying the outer wrapper `<tr>` as one giant multi-image grid row.
- Inside that wrapper row, it uses flat regex matching for `<td>` and `<img>`, so it counts nested image cells from the entire email as if they were sibling columns.
- In your uploaded HTML, that produces an effective column count of roughly 13-14, which yields a computed slot width around `34-38px`.
- The first image inside that giant block is the logo (`width="34" height="100"`), so its aspect ratio becomes the seed for the rest of the images.
- `finalizeCampaignHtml.ts` then reinforces the bad values by converting `height:auto` into fixed inline `height:100px`, which is why hero images, full-width images, and grids all collapse.
- The ResizeObserver warning is separate; it is not causing the bad image dimensions.

Implementation plan

1. Fix row parsing at the source
- Replace the current regex-based child `<td>` extraction in `supabase/functions/_shared/normalizeGridImages.ts` with a depth-aware parser that only returns direct child cells for a given `<tr>`.
- Reuse the same row/cell parser in `supabase/functions/_shared/finalizeCampaignHtml.ts` so both normalization and inline-height fixing operate on the exact same definition of a “grid row.”

2. Normalize only confirmed grid rows
- Only apply normalization when a row has true sibling image cells in the same immediate table row.
- Skip wrapper rows, mixed-content rows, header/footer rows, and any row that contains nested tables rather than direct image columns.
- Require a sane column count (for example 2-4 direct image cells) before any dimension rewriting happens.

3. Stop logo dimensions from seeding other images
- Explicitly exclude logo-like images and single small images from aspect-ratio seeding.
- For real grids, derive dimensions from that grid row’s own geometry only.
- If the row geometry is ambiguous, do nothing instead of inventing dimensions.

4. Scope style rewrites correctly
- Only rewrite `width`, `height`, `max-width`, and `object-fit` on images inside confirmed multi-image grid rows.
- Never rewrite standalone hero/full-width/banner images to tiny pixel widths.
- Preserve logo sizing only on actual logo placements.

5. Add hard safety guards
- Abort normalization if the computed slot width is implausibly small for a content image row.
- Abort if a candidate row has too many image cells to be a real campaign grid.
- Abort if a rewrite would shrink a non-logo image below a safe threshold.

6. Add regression QA for this exact failure
- In `supabase/functions/generate-campaign/index.ts` and/or `supabase/functions/visual-qa/index.ts`, add a guard that fails or flags output when multiple non-logo images share tiny placeholder-like dimensions such as `34x100` or `38x100`.
- Add a specific check for hero/full-width images with `max-width` under a reasonable threshold.

Files to update

- `supabase/functions/_shared/normalizeGridImages.ts`
- `supabase/functions/_shared/finalizeCampaignHtml.ts`
- `supabase/functions/generate-campaign/index.ts`
- `supabase/functions/visual-qa/index.ts`

Expected result

- Logo sizing stays isolated to the logo.
- Hero and full-width images render full width again.
- Only real side-by-side grids get normalized.
- This exact uploaded campaign stops producing the “tiny sliver” image failure.

Technical details

- The uploaded HTML already contains the bad values on non-logo images:
  - logo: `width="34" height="100"`
  - hero/full-width/grid images: also rewritten to `width="34" height="100"`
- That pattern directly matches the current algorithm:
  - wrapper row falsely treated as a grid
  - nested image cells counted as columns
  - slot width collapses to ~34-38px
  - first logo image supplies the height ratio
  - finalizer hardens the damage into inline CSS
- Prompt changes alone will not solve this until the post-processor is fixed.
