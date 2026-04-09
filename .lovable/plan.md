
No — the current Run Details view is not trustworthy yet. From the code, there are 4 concrete problems:

1. The permanent spinners are a logging bug. `started` and `completed` are being written as separate rows, so the original `started` rows never resolve and stay “loading forever.”
2. The screen is missing the actual evidence. Right now QA logs mostly counts/summaries:
   - `qa_screenshot` logs only `base64_length` / mime type
   - `qa_slice` logs only `slice_count`
   - `qa_compare` logs only score/count/summary  
   So there is nothing real for the UI to show for screenshot, slices, or comparison.
3. The view is not scoped to one run. It loads all `generation_events` for the campaign, so older and newer generations can be mixed together.
4. The QA agent is framed incorrectly. `visual-qa` does not explicitly say “the reference is layout only; different brand/copy/products are expected,” so it can produce misleading summaries like the Sundays vs skincare complaint.

## Plan

1. Audit the latest real run for the current campaign
   - Read the stored event rows and backend logs for the currently open campaign.
   - Verify exactly which reference(s), preview event data, slices, and QA inputs were actually used.
   - Confirm whether the bad summary came from prompt framing, wrong reference selection, or both.

2. Make run logging truthful
   - Add `run_id` and `event_key` to `generation_events`.
   - Change logging so a step starts once and then updates to `completed`/`failed` instead of inserting a second row.
   - Backfill legacy rows so older runs stop showing fake “still loading” entries.

3. Capture real debug artifacts
   - Persist the actual screenshot, output slices, reference slices, and rendered flow preview used for QA.
   - Log exact reference IDs/titles, selected reference mode, campaign brief, flow preview metadata, and the raw issue list.
   - Store images in backend storage and save URLs on the event record.

4. Fix the Run Details UI
   - Default to the latest run, with a run switcher for older runs.
   - Pair/collapse legacy started/completed duplicates.
   - Add dedicated sections for:
     - full screenshot
     - reference slices
     - output slices
     - side-by-side QA comparison
     - raw prompt/result/issue data
   - Add click-to-expand/lightbox views instead of only tiny thumbnails.
   - If an artifact is missing, show an explicit red error state instead of a blank section.

5. Fix the QA framing bug
   - Rewrite `visual-qa` so the reference is treated as architectural only.
   - Explicitly tell the model that brand, copy, products, and order details may differ and should not be flagged as failures.
   - Pass brand/campaign/reference context into the QA call so the model knows what it is auditing.

6. Remove wrong-reference ambiguity
   - Stop relying on current UI state alone for QA.
   - Persist the exact reference set used at generation time and use that stored set for the run.
   - Show those references in the Run Details header so you can verify them immediately.

7. Verify end-to-end
   - Test a fresh flow run and a fresh standard campaign run.
   - Leave/re-enter the editor and confirm the same run data is still visible.
   - Confirm old steps no longer remain stuck in `started`.
   - Confirm the QA section shows the actual images/slices used.
   - Confirm the summary no longer complains that the generated brand differs from the reference brand.

## Files likely affected
- `supabase/migrations/...`
- `supabase/functions/generate-campaign-multi/index.ts`
- `supabase/functions/_shared/generateCampaignCore.ts`
- `supabase/functions/visual-qa/index.ts`
- `src/pages/CampaignEditor.tsx`
- `src/components/campaign/GenerationTimeline.tsx`

## Technical details
- Keep the strict “no fake success” rule: if artifact capture or event logging fails, mark that step failed and show the real error.
- Store prompt text blocks directly, but store images as URLs rather than giant base64 blobs in the database.
- Legacy runs need either migration backfill or UI pairing heuristics so past timelines become readable too, not just future ones.
