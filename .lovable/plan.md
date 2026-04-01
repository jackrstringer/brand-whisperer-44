

## Plan: Improve Image Grid Quality in Campaign Generation

### Problem Analysis

The current system has a flawed `normalizeGridImages` function that blindly copies the **first image's dimensions** to all other images in a grid row. This causes several issues:

1. **Arbitrary canonical dimensions**: If the first image has wrong/missing dimensions, all images get wrong values
2. **No awareness of email width or column count**: The function doesn't calculate what dimensions images SHOULD be — it just copies whatever the first image has
3. **Non-greedy regex fails on nested tables**: Email HTML commonly nests tables inside `<td>` elements, so `<tr>[\s\S]*?</tr>` may match incorrectly
4. **Runs in 3 places redundantly**: generate-campaign, edit-campaign, and visual-qa all run it, sometimes undoing good AI output
5. **`enforceNoStackingLayout` strips ALL mobile rules**: It aggressively removes responsive CSS that may be needed, and injects class-based fixes that only work if the AI used those exact class names

### Root Causes

The normalizer is a blunt instrument — it doesn't understand the layout, just pattern-matches `<tr>` tags. The AI is already instructed to use correct ImageKit transforms, but then the normalizer overwrites them with potentially wrong values derived from the first image.

### Changes

**1. Rewrite `normalizeGridImages.ts` — smart dimension calculation**

Instead of copying the first image's dimensions, calculate the correct dimensions:
- Count columns in the row (number of `<td>` with images)
- Calculate per-column width: `Math.floor((470 - (columns - 1) * gap) / columns)` where gap defaults to 10px
- For height: if any image in the row has a height, use it to derive the aspect ratio. If none do, default to square (1:1) for grids
- Only normalize images that are missing dimensions or have clearly wrong ones (e.g., full-width in a 2-column grid)
- Preserve well-formed AI output — skip rows where all images already have consistent dimensions AND ImageKit transforms

**2. Fix the regex to handle nested tables**

Replace the simple `<tr>[\s\S]*?</tr>` regex with a proper approach that tracks nesting depth, or use a different strategy: find `<td>` siblings within the same parent rather than relying on `<tr>` matching.

**3. Make `enforceNoStackingLayout` less destructive**

- Only strip media queries that explicitly target grid/multi-column elements
- Don't inject class-based styles blindly — the AI rarely uses those exact class names
- Instead, inject a more targeted rule: `td { display: table-cell !important; }` inside a `min-width:620px` media query to preserve desktop layout without breaking mobile entirely

**4. Stop running normalizer in visual-qa**

The visual-qa function should only report issues, not silently "fix" them. Remove the automatic `normalizeGridImages` + `enforceNoStackingLayout` calls from visual-qa. Let the AI's find/replace patches handle issues instead. Keep the normalizer only in `generate-campaign` (after generation, before save) where it serves as a safety net.

**5. Improve generation prompt for grid clarity**

Add explicit instruction in the generation prompt:
- "For 2-column grids at 470px viewport: each image slot is 220px wide. Set both width='220' and height='220' (or appropriate aspect ratio) on every `<img>` AND its container `<td>`."
- "Always set explicit `width` and `height` attributes on every grid image. Never rely on CSS-only sizing."
- "For ImageKit URLs, always include `?tr=w-{W},h-{H},fo-auto` matching the slot dimensions."

### Files Modified

| File | Action |
|------|--------|
| `supabase/functions/_shared/normalizeGridImages.ts` | Rewrite — smart width calculation based on column count |
| `supabase/functions/_shared/enforceNoStackingLayout.ts` | Refine — less destructive, more targeted |
| `supabase/functions/visual-qa/index.ts` | Remove automatic normalizer calls; report-only |
| `supabase/functions/generate-campaign/index.ts` | Improve grid prompt instructions |
| `supabase/functions/edit-campaign/index.ts` | Use shared enforceNoStackingLayout import (already exists locally) |

### Key Design Principle

The normalizer should be a **safety net**, not the primary quality mechanism. The AI prompt is the primary driver. The normalizer only intervenes when images in a grid are clearly inconsistent — and when it does, it calculates correct dimensions from the layout structure rather than copying arbitrary values from the first image.

