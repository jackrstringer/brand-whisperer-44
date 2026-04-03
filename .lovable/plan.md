

## Fix: CTA buttons rendering full-width ("fat and big")

### Root cause

The generated button HTML uses this pattern:
```html
<td align="center" style="padding:...">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">  <!-- NO width constraint -->
    <tr>
      <td style="background-color:#30332F;border-radius:25px;">
        <a href="#" style="display:inline-block;padding:15px 40px;...">shop best-sellers</a>
      </td>
    </tr>
  </table>
</td>
```

The inner `<table>` wrapping the CTA has no width constraint. In HTML, tables default to expanding to fill their container, making the colored `<td>` background stretch to full width — producing the "fat" button appearance. The generation prompt already says "NEVER width:100%" and "auto width" for buttons, but the AI isn't emitting a `width:auto` style on the wrapper table.

Secondary issue: The prompt specifies `1.5px solid border` on buttons matching the brand's `button_border` color, but the generated HTML has no border at all.

### Changes

**1. `supabase/functions/generate-campaign/index.ts`** — Strengthen button prompt

In the BUTTONS section (~line 139-144), add an explicit structural requirement:

```
BUTTONS:
...
- Structure: The wrapper <table> around the CTA <td> MUST have style="margin:0 auto;" (no width attribute). This prevents the table from stretching to 100%.
- The <a> inside the button <td> MUST use display:inline-block with horizontal padding. Never set width:100% on the <a> or the wrapper table.
```

**2. `supabase/functions/edit-campaign/index.ts`** — Mirror the same button rule (if it has a BUTTONS section)

**3. `supabase/functions/_shared/finalizeCampaignHtml.ts`** — Add a defensive post-processing step

Add a `fixButtonTableWidth` step that finds the common CTA pattern (a `<table>` containing a single `<tr>` with a single `<td>` that has a background-color and contains an `<a>` tag) and ensures the wrapper `<table>` does not expand to full width by injecting `style="margin:0 auto;"` if missing. This catches any generated HTML where the AI omits the constraint.

### What this fixes
- Buttons will shrink-wrap to their text content + padding instead of stretching full-width
- The fix is both preventive (prompt) and defensive (post-processing)

