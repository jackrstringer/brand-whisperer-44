

## Fix 4 Bugs in `extract-brand/index.ts`

### Bug 1: Guide mode returns immediately, killing processing (lines 396-408)
The current code fires `processGuideStep` as a detached promise and returns HTTP response immediately. Deno isolate shuts down, killing the guide generation. Fix: make guide and full modes synchronous with proper status updates, matching the spec mode pattern.

Replace lines 386-408 with synchronous handler that:
- Sets `running_spec` status, awaits spec, sets `spec_complete`
- Sets `running_guide` status, awaits guide, sets `complete`
- Catches errors and writes `failed` status with error message

### Bug 2: Invalid model ID (line 518)
Change `"claude-opus-4-6-20260801"` → `"claude-opus-4-6"`

### Bug 3: Guide call needs streaming
Replace `runGuideCall` (lines 500-547) with streaming version that:
- Uses `stream: true` in the API request
- Reads SSE chunks to accumulate HTML
- Keeps the Deno isolate alive through gateway timeout via active I/O
- Same post-processing (markdown fence stripping, DOCTYPE extraction, spacing normalization)

### Bug 4: Remove dead code
Delete `saveError` function (lines 429-444) and `processExtraction` function (lines 621-661). Also remove the fallback call to `processExtraction` on line 410 — replace with an error since brandId-less calls should use the new synchronous path or fail.

### Deployment
Deploy `extract-brand` edge function and verify deployment succeeded.

### Files changed
- `supabase/functions/extract-brand/index.ts` — only file touched

