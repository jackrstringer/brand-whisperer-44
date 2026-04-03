

## Plan: Enforce Correct Grid Layout Structure in Prompts and Post-Processor

### Problem

The AI model sometimes generates multi-column grids using `display:inline-block` side-by-side tables or CSS classes like `mobile-grid-col` that set `display:block` on grid columns. Both techniques break at the 470px preview width, causing grids to stack vertically.

The correct technique is direct `<td>` siblings inside a single `<tr>`.

### Changes

**1. Update UNIVERSAL_EMAIL_RULES in `supabase/functions/generate-campaign/index.ts`**

Add a new `GRID LAYOUT` section after the existing `IMAGES` section with the user's exact structural requirements:

```text
GRID LAYOUT — REQUIRED STRUCTURE:
- Multi-column image grids MUST use direct <td> siblings inside a single <tr>. Never use display:inline-block tables side by side.
- Correct 2-column example:
  <tr>
    <td width="295" valign="top" style="padding:0 2px 0 0;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
    <td width="295" valign="top" style="padding:0 0 0 2px;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
  </tr>
- Never use: <table align="left" style="display:inline-block"> as a column technique. This stacks vertically at any viewport narrower than the combined column widths.
- Never add mobile-grid-col or any CSS class that sets display:block on grid columns. The email renders at 470px — mobile stacking rules will fire and destroy the layout.
```

**2. Update REFERENCE_MODE_SYSTEM in the same file**

Add the same grid layout rules so reference/dupe mode also produces correct structure.

**3. Update QA_SYSTEM_PROMPT in the same file**

Add a new rule 11:
```text
11. GRID STRUCTURE: Flag any multi-column grid that uses display:inline-block tables instead of direct <td> siblings. Flag any CSS class that sets display:block on grid columns.
```

**4. Update `enforceNoStackingLayout.ts`**

Add a post-processor step that strips `display:inline-block` from any `<table>` tag that appears to be a grid column (i.e., has `align="left"` and `display:inline-block` in its style). This is a safety net for when the model ignores the prompt.

**5. Update QA in `supabase/functions/visual-qa/index.ts`**

Add the same grid structure rule to the visual QA prompt.

### Files to modify

| File | Change |
|------|--------|
| `supabase/functions/generate-campaign/index.ts` | Add GRID LAYOUT section to all three prompts |
| `supabase/functions/_shared/enforceNoStackingLayout.ts` | Strip inline-block from grid column tables |
| `supabase/functions/visual-qa/index.ts` | Add grid structure check to visual QA |

