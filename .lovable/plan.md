
Goal

Fix the real persistence bugs causing variants and references to disappear, and make campaign state durable across reloads, saves, and regenerations.

What I found

- This is not just a UI misunderstanding. There are two real persistence bugs.
- `src/pages/CampaignEditor.tsx` restores `selectedReference` only from `localStorage` (`ref-panel-${campaignId}`). That means the eye button/reference preview can disappear on refresh, browser change, or whenever you land on a different campaign ID.
- `saveVariantAsNewCampaign()` creates a new campaign with only the chosen `html` and a few basic fields. It does not copy `variant_htmls`, `reference_campaign_id`, `reference_campaign_type`, or `reference_strength`, so the new campaign opens looking like the variants/reference “vanished.”
- `supabase/functions/generate-campaign-multi/index.ts` currently sets `variant_htmls: []` as soon as generation starts. That is an actual wipe of the saved variants on that record before the new run finishes.
- Current editing/switching writes only `campaign.html` in several places. It does not keep `variant_htmls[activeVariantIndex].html` in sync, so reload/restoration can drift and make variant state look broken.
- The network activity I checked also matches this: current interactions are patching `html`, not preserving variant/reference context.

Implementation plan

1. Stop wiping variants on regenerate
- In `supabase/functions/generate-campaign-multi/index.ts`, remove the initial `variant_htmls: []` update.
- Keep existing variants on the record until the new 3-variant result is ready, then replace them in one final update.

2. Persist reference usage on the campaign itself
- In `src/pages/CampaignEditor.tsx`, when generation starts with a reference, save:
  - `reference_campaign_id`
  - `reference_campaign_ids`
  - `reference_campaign_type`
  - `reference_strength`
- Keep localStorage only as a temporary cache, not the source of truth.

3. Rebuild the reference on load
- In `CampaignEditor.tsx`, load reference data from the campaign row first:
  - if type = `library`, fetch the record from `reference_campaigns`
  - if type = `campaign`, fetch the source campaign
- Fall back to localStorage only for older campaigns that predate this fix.
- This restores the eye button and reference preview reliably.

4. Preserve full context when saving a variant as a new campaign
- In `saveVariantAsNewCampaign()`, copy:
  - `variant_htmls`
  - reference fields
  - other generation settings already tied to that campaign
- Set the new campaign’s main `html` to the chosen variant, but keep the full variant set attached so it does not look like the other options were deleted.

5. Keep variant data synced during edits