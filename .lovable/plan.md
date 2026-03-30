

## Plan: Replace Perfection Mode with Default 3-Variant Generation

### Summary
Remove Perfection Mode entirely. Instead, every campaign generation produces 3 variants by default (the original + 2 creative variations). Users browse variants with tab buttons above the preview and can save any variant as its own campaign. Also fix the "delayed generation failed" error.

### Root Cause of "Generation Failed" Error
The `generate-campaign-multi` edge function uses `EdgeRuntime.waitUntil()` to run background processing. If a user previously triggered Perfection Mode for a campaign and then regenerated in standard mode, the old background process can still complete later and set `status = "error"` on the campaign — causing the delayed error toast minutes after the campaign appears finished.

### Architecture

```text
User clicks "Generate Campaign"
  │
  ├─ Frontend fires generate-campaign-multi (always, no toggle)
  │   └─ Returns 202 immediately
  │   └─ Background: fires 3 parallel generate-campaign calls
  │       ├─ Variant 0: Original (no creative seed modification)
  │       ├─ Variant 1: "More Creative" seed appended
  │       └─ Variant 2: "More Conservative" seed appended
  │
  ├─ Frontend polls campaign.status for "variants_ready"
  │   └─ When ready: loads variant_htmls, shows variant 0 by default
  │
  └─ Preview panel shows tab bar: "Original | Creative | Conservative"
      └─ Editing applies to whichever variant is active
      └─ "Save as Campaign" creates a new campaign from variant HTML
```

### Changes

**1. `supabase/functions/generate-campaign-multi/index.ts`**
- Rename creative seeds: Variant 0 = "Original" (NO creative seed — identical to current single generation), Variant 1 = "More Creative", Variant 2 = "More Conservative"
- Remove `generation_mode: "perfection"` — just use a neutral marker
- Fix race condition: before setting status to "error" in the background catch, check that the campaign's current status is still "generating" (not already "ready" from a newer generation)

**2. `src/pages/CampaignEditor.tsx`**
- Remove all Perfection Mode state and UI: `generationMode`, `showVariantPicker`, the Switch toggle, `generatePerfectionMode()`, `runAggressiveQaLoop()`, `handleVariantSelect()`, `qaProgress`
- Remove `VariantPicker` import and rendering
- Change `generateCampaign` to always call `generate-campaign-multi` instead of `generate-campaign`
- Change polling to look for `variants_ready` instead of `ready`
- When variants arrive: store them in state, display variant 0 as the active campaign HTML, show variant tabs
- Add variant state: `activeVariantIndex` (default 0), `variantHtmls` array
- Add variant tab bar above the preview iframe: 3 labeled tabs (Original, Creative, Conservative)
- Switching tabs changes displayed HTML and sets the active variant for editing
- Add "Save as New Campaign" button that clones the current variant into a new campaign record
- On initial variant selection, update the campaign record with variant 0's HTML and status "ready"
- Editing (chat) operates on whichever variant HTML is active
- Fix delayed error: when polling finds "ready" and stops, also clear the timeout. Add a guard so if status changes to "error" but we already found "ready", ignore it.

**3. `src/components/campaign/VariantPicker.tsx`**
- Delete this file entirely (full-screen picker UI no longer needed)

**4. `supabase/functions/aggressive-qa/index.ts`**
- Delete this file (was only used for Perfection Mode QA loop)

**5. Database considerations**
- No schema changes needed — `variant_htmls` jsonb column and `generation_mode` column already exist
- `variant_htmls` continues to store the 3 variant objects

### Variant Tab UI (in preview header)
- 3 small tabs/pills: "Original", "Creative", "Conservative"
- Active tab highlighted with primary color
- Below tabs: a small "Save as New Campaign" button (creates a duplicate campaign from current variant's HTML)

### Delayed Error Fix Details
- In `generate-campaign-multi/index.ts`: before setting `status: "error"`, read current status first; if it's already "ready" or "draft", skip the update
- In `CampaignEditor.tsx`: once polling finds "variants_ready" and stops, store a ref `generationCompletedRef.current = true`. The timeout handler checks this ref before showing error.
- Clear the 5-minute timeout when polling completes

### Files Modified

| File | Action |
|------|--------|
| `supabase/functions/generate-campaign-multi/index.ts` | Modify — new seeds, remove perfection branding, add status guard |
| `src/pages/CampaignEditor.tsx` | Modify — remove perfection mode, always use multi, add variant tabs |
| `src/components/campaign/VariantPicker.tsx` | Delete |
| `supabase/functions/aggressive-qa/index.ts` | Delete |

