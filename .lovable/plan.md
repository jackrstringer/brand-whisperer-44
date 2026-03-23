

# Deep Brand Analysis — Three-Pass Visual Audit + Brand Guide + Email Design Floor

## Overview

Replace the current "extract JSON → save → generate campaigns" brand creation flow with a much deeper three-pass process that produces a comprehensive brand design system document. The user reviews the audit findings before the system generates the final brand profile. This ensures the extracted design rules are accurate and the user has confidence in what will guide all future campaigns.

The system also enforces a "quality floor" — baseline email design best practices that never get compromised even if the reference emails have questionable design choices.

---

## New Flow

```text
Current:  Info → Sources → Uploads → [auto-analyze] → Review JSON → Save → Generate campaigns
Proposed: Info → Sources → Uploads → [Pass 1: Deep Audit] → Review Audit → [Pass 2+3: Spec + Guide] → Review Guide → Save → Generate campaigns
```

### Pass 1: Deep Visual Audit (edge function)
- Uses the comprehensive audit checklist from the skill (logo treatment, colors, typography headlines/body/subheads, CTA buttons with italic detection, image treatment, section dividers, footer, icons, special patterns, voice)
- Returns structured findings as JSON organized by design element (not by email)
- Flags `[NEEDS CONFIRMATION]` items and inconsistencies between campaigns
- Presented to the user for review/correction before proceeding

### Pass 2: Internal Spec Compilation (edge function, triggered after user confirms audit)
- Takes confirmed/corrected audit + email design quality floor rules
- Compiles into structured brand spec (the internal blueprint)
- No separate user confirmation needed

### Pass 3: Brand Guide Generation (edge function, same call as Pass 2)
- Generates a comprehensive HTML brand guide document (self-contained, no external images)
- Sections: Color System, Typography, Button System, Layout/Anatomy, Reusable Components, Photography Direction, Voice & Tone, Design Rules (Do's/Don'ts)
- This HTML guide is stored alongside the brand profile and is viewable/downloadable
- The system_prompt for campaign generation is derived from this guide

### Email Design Quality Floor
Baked into both the synthesis and the generation prompt — a set of non-negotiable rules that override brand reference if the reference emails have bad practices:
- Fluid layouts, consistent padding, proper CTA sizing
- Body text min 16px, logo max 150px, buttons never full-width
- Footer always present and separate
- No text on images, consistent alignment within sections
- Rounded corners preferred unless brand explicitly uses sharp
- "Flowy" designs — minimize hard section cuts, prefer gentle transitions with spacing

---

## Database Changes

### Add column to `brand_profiles`
- `brand_guide_html text nullable` — the generated HTML brand guide document
- `audit_findings jsonb nullable` — the Pass 1 audit results for reference

No new tables needed.

---

## Edge Function Changes

### New: `supabase/functions/audit-brand/index.ts`
Pass 1 — Deep visual audit. Receives the same sliced images as `extract-brand`. Uses the comprehensive audit checklist. Returns structured JSON findings organized by design element.

- System prompt: the full audit checklist from the skill (logo, colors, typography, CTAs, image treatment, section dividers, footer, icons, special patterns, voice)
- Per-campaign parallel analysis (Sonnet), then synthesis of findings across campaigns
- Output: `{ audit: { logo, colors, typography_headlines, typography_body, typography_subheads, cta_buttons, image_treatment, section_dividers, footer, icons, special_patterns, voice }, inconsistencies: [...], needs_confirmation: [...] }`

### Modify: `supabase/functions/extract-brand/index.ts`
Rename conceptually to serve Pass 2+3. New endpoint accepts:
- The confirmed audit findings (JSON)
- Brand name, industry
- The original sliced images (for Pass 3 guide generation context)

Returns:
- `extraction` (structured brand values — same as now)
- `system_prompt` (campaign generation prompt — same as now but richer)
- `brand_guide_html` (the full HTML brand guide document)

The synthesis prompt now incorporates the email design quality floor rules, ensuring the system_prompt never allows bad practices even if references showed them.

### Modify: `supabase/functions/generate-campaign/index.ts`
- No structural changes needed — it already consumes `system_prompt` and `raw_extraction`
- The improved quality of these values from the deeper audit process will naturally improve output

---

## Frontend Changes

### `src/pages/BrandSetup.tsx` — New steps in the flow

Change step type from `"info" | "sources" | "uploads" | "analyzing" | "review"` to:
`"info" | "sources" | "uploads" | "auditing" | "audit_review" | "generating_guide" | "guide_review"`

**`auditing` step**: Progress UI while Pass 1 runs. Shows "Analyzing your campaigns..." with progress messages.

**`audit_review` step**: Displays the audit findings in a clean, organized UI:
- Sections for each design element (colors, typography, buttons, etc.)
- Highlighted `[NEEDS CONFIRMATION]` items with editable fields
- Inconsistencies called out with the user asked to resolve
- "Confirm & Generate Guide" button to proceed
- "Re-analyze" option if they uploaded wrong files

**`generating_guide` step**: Progress UI while Pass 2+3 runs.

**`guide_review` step**: 
- Renders the brand guide HTML in a large iframe (like the campaign preview)
- Shows key extracted values (colors, fonts, buttons) as a summary sidebar
- "Save Brand & Continue" button
- Option to download the guide HTML
- Proceeds to save brand + generate starter campaigns (existing flow)

### New: `src/pages/BrandGuide.tsx` (route: `/brands/:brandId/guide`)
- View the saved brand guide anytime from brand settings or sidebar
- Renders `brand_guide_html` in an iframe
- Download button

### `src/components/AppSidebar.tsx`
- Add "Brand Guide" link under brand section

### `src/App.tsx`
- Add route `/brands/:brandId/guide`

---

## Implementation Order

1. Database migration (add `brand_guide_html` and `audit_findings` columns)
2. `audit-brand` edge function (Pass 1 — deep visual audit)
3. Update `extract-brand` edge function (Pass 2+3 — spec + guide generation with quality floor)
4. Update `BrandSetup.tsx` (new audit_review and guide_review steps)
5. Create `BrandGuide.tsx` page + route
6. Update sidebar with guide link

---

## Key Design Decisions

- **Quality floor over brand fidelity**: If a brand's reference emails use 12px body text or full-width buttons, the system overrides with best practices. The guide will note "Brand references showed X, but we recommend Y for better performance."
- **Italic CTA detection**: The audit prompt explicitly warns about JPEG compression artifacts making bold text appear italic. Default is `font-style: normal` unless unmistakable.
- **No images in the guide**: The HTML guide is self-contained with CSS gradients and color blocks for visual examples — no `<img>` tags pointing to uploaded files.
- **Pass 1 uses Sonnet for speed** (per-campaign parallel), **Pass 2+3 uses Opus for quality** (single synthesis + guide generation call).

