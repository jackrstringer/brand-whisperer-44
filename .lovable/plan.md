

## Plan: Eliminate HTTP Hop in Multi-Variant Generation

### Problem
`generate-campaign-multi` calls `generate-campaign` via HTTP fetch through the public gateway, which enforces a ~150s timeout. Generation routinely takes 120-180s, causing 504 errors even though the work completes.

### Solution
Extract the core generation logic from `generate-campaign/index.ts` into a shared module, then import it directly in `generate-campaign-multi` — no HTTP call, no gateway timeout.

### Files to explore first
- `supabase/functions/generate-campaign/index.ts` — understand the full generation pipeline to identify what can be extracted

### Files changed

1. **`supabase/functions/_shared/generateCampaignCore.ts`** (new)
   - Extract the core generation logic (prompt building, Anthropic calls, QA pass, finalization, image rehosting) into an exported async function like `generateCampaignCore(params): Promise<{ html: string }>`.
   - This function takes the same parameters the edge function currently receives in its request body, plus the supabase client.

2. **`supabase/functions/generate-campaign/index.ts`** (modified)
   - Slim down to a thin HTTP wrapper: parse request, call `generateCampaignCore()`, return response.
   - All existing behavior preserved — this is a pure refactor for the HTTP entry point.

3. **`supabase/functions/generate-campaign-multi/index.ts`** (modified)
   - Replace the 3x `fetch()` calls with direct `generateCampaignCore()` calls.
   - Remove the HTTP fetch, headers, and URL construction.
   - Keep `Promise.all` for parallel execution and `EdgeRuntime.waitUntil()` for background processing.
   - Keep all existing status guards and variant_htmls assembly logic.

### Why not a queue system?
A queue would require a new database table, a cron job or polling worker, and significantly more complexity. The direct import approach solves the timeout problem with minimal changes and no new infrastructure.

### Risk
The shared module must be compatible with Deno imports. Supabase edge functions support importing from `_shared/` directories, which is already used in this project (e.g., `_shared/finalizeCampaignHtml.ts`).

