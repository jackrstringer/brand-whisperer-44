
Summary

Fix the remaining malformed grid campaigns by making the generation, post-processing, and preview layers agree on true fixed slot dimensions for grid images. The uploaded HTML still shows the exact failure mode: square `width`/`height` attributes, but `style="height:auto"` on non-transformable image URLs, so the browser keeps each image’s natural aspect ratio and leaves white gaps.

What I found

- The uploaded campaign HTML still has 2-column rows like `width="300" height="300" style="width:100%; max-width:300px; height:auto; display:block;"`, which guarantees uneven rendered heights when the source images are not square.
- `generate-campaign` still includes a universal rule that every image should use `height:auto`, which conflicts with its later grid-specific guidance.
- `generate-campaign` imports `rehostHtmlImagesWithImageKit` but does not run it before returning, and the helper currently skips project storage URLs anyway, so most campaign images never become transformable URLs.
- The preview iframe, reference previews, and visual QA capture all inject global CSS with `img { ... height:auto!important; }`, which overrides the explicit heights the normalizer is trying to enforce.
- Existing campaigns may also contain legacy helper CSS from older no-stacking logic, so the fix needs to clean already-saved HTML too.

Plan

1. Unify final HTML processing
- Add one shared finalization step used by both `generate-campaign` and `edit-campaign`.
- In that step: remove legacy injected helper CSS, enforce no-stacking, rehost eligible images, then normalize grid rows.

2. Make grid normalization geometry-driven
- Keep the 470px render width, but stop assuming a fixed 10px gutter.
- Derive slot width from the row’s actual structure: image-cell count, `%` widths, and cell padding/gutters.
- For true multi-image rows, force matching width/height attributes and matching inline pixel heights on each image so the browser cannot fall back to natural aspect ratio.
- Normalize related width/max-width styles at the same time, but leave non-grid images alone.

3. Make campaign images actually transformable
- In `generate-campaign`, run image rehosting before the sub-generation early return and before final persistence.
- Update the shared image helper so project storage URLs used in campaigns can also be rehosted when needed, not just external URLs.
- Once hosted, apply matching `?tr=w-X,h-Y,fo-auto` transforms for grid slots.

4. Remove preview overrides that break fixed-height rendering
- In `CampaignEditor`, `ReferencePanel`, and `visualQaCapture`, remove the global `height:auto!important` image rule and avoid `!important` on image sizing.
- Keep safe width constraints, but let explicit per-image heights win.

5. Fix the prompt contradiction
- Change the universal image rule so `height:auto` applies only to non-grid images.
- Add a hard requirement that grid/mosaic/two-column images must use explicit slot height in both attributes and inline styles, with matching transforms when available.

6. Quiet the preview observer warning
- Update the iframe `ResizeObserver` path so height updates only run when the measured height actually changes and are scheduled through `requestAnimationFrame`, which should remove the current observer-loop warning.

Files to update

- `supabase/functions/generate-campaign/index.ts`
- `supabase/functions/edit-campaign/index.ts`
- `supabase/functions/_shared/normalizeGridImages.ts`
- `supabase/functions/_shared/imagekit.ts`
- `src/pages/CampaignEditor.tsx`
- `src/components/campaign/ReferencePanel.tsx`
- `src/lib/visualQaCapture.ts`

Expected result

- The exact failure in the uploaded Solawave campaign is fixed: side-by-side image rows render as equal-height tiles without white bands.
- New generations and later edits use real slot-filling crops instead of mixed natural-height images.
- Preview, visual QA, and saved campaign HTML all honor the same layout rules.

Technical details

- The core issue is a pipeline contradiction:
  1. the normalizer tries to enforce fixed grid dimensions,
  2. the prompt still tells the model to output `height:auto`,
  3. the iframe CSS forcibly resets image height back to auto,
  4. and the URLs are often not transformable in the first place.
- The fix avoids brittle hardcoding by deriving slot geometry from each row’s real structure, then making generation, editing, preview, and QA all respect that same output.
