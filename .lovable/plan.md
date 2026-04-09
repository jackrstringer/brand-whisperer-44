

## Fix: Campaign Performance Report Generation

### Problem
Three issues causing the report to fail or appear truncated:

1. **Bug (runtime crash)**: `buildContinuationPrompt` is called with 3 arguments (`sourcePrompt, html, missingMarkers`) but the function signature only accepts 2 parameters (`existingHtml, missingMarkers`). So `missingMarkers` receives the HTML string, causing `missingMarkers.join is not a function`.

2. **Token limit too low**: `max_tokens: 8192` is nowhere near enough for a 5-section report. Claude Opus supports 32K output tokens — we should use that.

3. **Edge function timeout**: The function runs the full pipeline synchronously before responding. Claude Opus generating 32K tokens of HTML + Perplexity competitor research can easily take 2-3 minutes, exceeding the gateway timeout. Need to use `EdgeRuntime.waitUntil()` (fire-and-forget pattern already used elsewhere in the codebase) to return immediately and let generation run in the background.

### Plan

#### 1. Fix `campaignReportGenerator.ts`
- Fix `buildContinuationPrompt` signature to accept 3 params: `(sourcePrompt, existingHtml, missingMarkers)`
- Increase `max_tokens` from 8192 to 32000
- Increase the per-chunk timeout from 120s to 300s
- Keep the continuation loop (up to 4 retries) as a safety net

#### 2. Make `generate-campaign-report/index.ts` async
- Return `{ success: true }` immediately after setting status to "generating"
- Use `EdgeRuntime.waitUntil()` to run the full pipeline in the background (same pattern as `generate-campaign-multi` and `research-brand`)
- The frontend already polls via `useCampaignReport` — no frontend changes needed

#### 3. Deploy and verify
- Deploy the updated edge function
- Test with curl to confirm it returns immediately without 500

### No frontend changes needed
The Intelligence page, Shadow DOM rendering, polling hook, and download button all work correctly already. The only issue is the edge function crashing and timing out.

