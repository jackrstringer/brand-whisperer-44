

# Fix Visual QA Pipeline: Remove Fake Passes, Add Hard Caps

## Problem Summary

The visual QA pipeline has three categories of failure:

1. **Silent success fallbacks** — When Claude returns a 400 error (image too large) or JSON fails to parse, the system lies and returns `passes_visual_qa: true`. The client-side catch block also tells the user "campaign is still usable" on any error.

2. **No image dimension safety cap** — Screenshots can be 10,000px+ tall. When sent to Claude (even as slices), the total payload or individual slice dimensions can exceed Anthropic's limits, triggering the 400 that gets silently swallowed.

3. **Stale width references** — The visual-qa prompt still says "470px viewport" in multiple places despite the renderer now using 390px. The capture-email-screenshot log message also says 470px.

## Changes

### 1. Remove all fake-pass paths from `visual-qa/index.ts`

- **Line 215-228**: Delete the `if (anthropicResp.status === 400)` block that returns `passes_visual_qa: true`. Let it fall through to the `throw` on line 229 so the error propagates honestly.
- **Lines 240-253**: Delete the catch block that returns `passes_visual_qa: true` on JSON parse failure. Replace with a proper error response (`status: 500`, `error: "Failed to parse QA response"`).
- Update the prompt to say 390px instead of 470px (lines 25, 32, 53).

### 2. Remove "still usable" lie from `CampaignEditor.tsx`

- **Line 700-706**: Change the catch block to set `visual_qa_status: 'error'` in the database and show the actual error message to the user instead of "campaign is still usable."

### 3. Cap screenshot height in `capture-email-screenshot/index.ts`

- Change `viewport_height` from 10000 to 7500. This keeps the full-page screenshot under Claude's 8000px single-image dimension limit.
- Fix the log message on line 45 that still says "470px" — change to "390px".

### 4. Add slice dimension safety in `slice-image-on-demand` or `visual-qa`

- Before sending slices to Claude in `visual-qa/index.ts`, check each slice image's dimensions. If any individual slice exceeds 1800px in height, downscale it (or skip and report error). This prevents the 400 from ever happening for sliced images.
- Use the existing `capImageDimensions` pattern (referenced in memory) or add inline downscaling via ImageKit URL transforms for ImageKit-hosted slice URLs.

### 5. Remove fake-pass paths from `klaviyo-validate-template/index.ts`

- Remove the three places that return `{ valid: true, skipped: true }`:
  - No Klaviyo connection (line 36-39) — change to `{ valid: false, skipped: true, error: "No Klaviyo connection" }`
  - Network error (line 59-62) — change to `{ valid: false, error: "Network error connecting to Klaviyo" }`
  - Catch-all (line 96-99) — change to return `status: 500` with the actual error

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/visual-qa/index.ts` | Remove 2 fake-pass blocks, fix 470→390 in prompt, add slice dimension cap |
| `supabase/functions/capture-email-screenshot/index.ts` | Cap viewport_height to 7500, fix log message |
| `supabase/functions/klaviyo-validate-template/index.ts` | Remove 3 fake-pass blocks |
| `src/pages/CampaignEditor.tsx` | Change catch to set error status + show real error |

### Deployment

All 3 edge functions (`visual-qa`, `capture-email-screenshot`, `klaviyo-validate-template`) will be redeployed after changes.

