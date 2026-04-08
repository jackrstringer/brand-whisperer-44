

## Problems Identified

**1. Visual QA is toothless — report-only, no structural comparison**
- The `runVisualQa` function (line 464-476) does NOT send `referenceImageUrls` to the edge function, so the AI has no idea what the campaign was supposed to look like structurally.
- When QA finds critical issues, it just posts a chat message. Bad campaigns still get shown to the user immediately.
- The system prompt checks generic email quality but doesn't compare against the reference structure (grid layouts, section ordering, image placement patterns).

**2. Eye icon disappears because reference restoration is fragile**
- The eye icon renders only when `selectedReferences.length > 0` (line 3496).
- References are restored from localStorage first (line 206-213), then from DB `reference_campaign_ids` (line 304-323). But DB restoration only runs `if selectedReferences.length === 0`, meaning if localStorage was cleared (or the user is on a different device), AND the DB fetch fails or returns empty, the icon vanishes.
- The condition should fall back to checking `campaign.reference_campaign_ids` directly as an additional guard.

## Plan

### Task 1: Make visual QA structurally compare against references

**File: `src/pages/CampaignEditor.tsx`**
- In `runVisualQa`, pass `referenceImageUrls` from `selectedReferences` (their `image_urls` or `thumbnail_url`) to the visual-qa edge function so the AI can compare structural fidelity.

**File: `supabase/functions/visual-qa/index.ts`**
- Enhance the system prompt to explicitly compare generated output against reference screenshots for:
  - Section count and ordering (hero → grid → CTA → footer)
  - Grid column count matching (2-col vs 3-col)
  - Image-to-text ratio similarity
  - Overall structural fidelity score
- Add a new `structural_fidelity` field to the JSON output schema (1-10 score)
- Flag campaigns that deviate significantly from the reference structure as critical issues

### Task 2: Block bad campaigns from reaching the user (auto-remediation)

**File: `src/pages/CampaignEditor.tsx`**
- When visual QA returns `passes_visual_qa: false` with critical issues AND `structural_fidelity < 5`, automatically trigger a remediation pass via `edit-campaign` with the QA issues as instructions.
- Show a "Refining layout..." status instead of immediately presenting the broken variant.
- Cap at 1 auto-remediation attempt to avoid infinite loops.

### Task 3: Fix eye icon reliability

**File: `src/pages/CampaignEditor.tsx`**
- Change the eye icon visibility condition from `selectedReferences.length > 0` to also check `campaign?.reference_campaign_ids?.length > 0`.
- When the icon is shown based on DB IDs but `selectedReferences` is empty, lazily load the references on first click.
- This ensures the icon is always visible when a reference was used, regardless of localStorage/state restoration timing.

### Technical Details

```text
Current flow:
  Generate → Show to user → Visual QA (report only) → Chat message

New flow:
  Generate → Visual QA (with reference comparison)
    ├─ Score ≥ 5 → Show to user + report
    └─ Score < 5 → Auto-remediate → Show fixed version + report
```

- The auto-remediation uses the existing `edit-campaign` edge function with QA-generated find/replace patches
- Reference images are sent as URLs (not base64) to the visual-qa function — they're already public ImageKit URLs
- Eye icon uses a compound condition: `campaign?.html && (selectedReferences.length > 0 || (campaign?.reference_campaign_ids?.length ?? 0) > 0)`

