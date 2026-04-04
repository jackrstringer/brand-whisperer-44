

## Plan: Loop Reprocessing Until Complete

### Change

Update `supabase/functions/reprocess-asset-compositions/index.ts` to loop through all batches in a single invocation instead of stopping after one batch of 10. After each batch completes, check if there are remaining assets and continue processing until none are left.

### Files changed
- `supabase/functions/reprocess-asset-compositions/index.ts` — wrap the fetch-and-process logic in a `while(true)` loop that breaks when no more assets with `composition_data IS NULL` are found. Track cumulative succeeded/failed counts across all batches.

