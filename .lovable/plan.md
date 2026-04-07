

## Problem: Edit AI Lacks Viewport Context

The generation pipeline has extensive instructions about the 470px rendering viewport, grid structure rules, and anti-stacking patterns. The edit-campaign function has **none of this context**. When the edit AI sees email HTML, it doesn't know:

1. **The email renders at exactly 470px wide** — not desktop width
2. **Multi-column grids use `<td>` siblings inside `<tr>`** — not inline-block tables
3. **Mobile stacking CSS is stripped** — so side-by-side tricks that rely on `display:inline-block` will break
4. **Images use fixed pixel dimensions** tied to the 470px viewport math

Without this context, the AI may "helpfully" restructure layouts when making simple edits because it misinterprets the rendering environment.

## Solution

Add a **RENDERING CONTEXT** block to both the primary edit system prompt and the full-HTML retry fallback prompt in `supabase/functions/edit-campaign/index.ts`. This block will include:

### Content to add (single block, both prompts):
```
RENDERING CONTEXT:
- This email renders at exactly 470px wide. It is NOT a desktop email.
- At 470px, multi-column grids use direct <td> siblings inside a single <tr>. 
  DO NOT use display:inline-block tables or CSS class-based column systems.
- Image dimensions are calculated for 470px: full-width = w-470, 
  2-col grid slots ≈ w-220, 3-col grid slots ≈ w-145.
- Mobile stacking rules are stripped post-generation. DO NOT add any CSS 
  that sets display:block on table cells or width:100% on columns.
- The layout you see in the HTML IS the final layout. Do not "fix" or 
  "improve" it by restructuring columns or changing stacking behavior.
```

### Files changed:
- **`supabase/functions/edit-campaign/index.ts`** — Add the rendering context block to:
  1. The main `systemMsg` (line ~340, near the existing STRUCTURE PRESERVATION rules)
  2. The full-HTML retry fallback system prompt (line ~633)

This is a small, targeted change — just adding missing context that the generation pipeline already has.

