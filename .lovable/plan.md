

## Audit Results — Issues Found

### CRITICAL Issues (will break at runtime)

**1. Missing database migration for `visual_qa_status` and `visual_qa_score`**
The `runVisualQa` function writes `visual_qa_status` and `visual_qa_score` to the `campaigns` table (lines 564-574), but the migration to add these columns was never executed. Every QA pass/fail write will silently fail.

**Fix:** Run migration:
```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS visual_qa_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS visual_qa_score integer;
```

**2. Missing `config.toml` entries for new edge functions**
`capture-email-screenshot` and `slice-image-on-demand` are not registered in `supabase/config.toml`. Only `slice-reference` has `verify_jwt = false`. Without entries, these functions will require JWT verification by default, which means `supabase.functions.invoke()` calls from the client will need a valid auth token (which they should have — but explicit `verify_jwt = false` is safer and matches the pattern used by `slice-reference`).

**Fix:** Add to `config.toml`:
```toml
[functions.capture-email-screenshot]
verify_jwt = false

[functions.slice-image-on-demand]
verify_jwt = false
```

**3. ScreenshotOne HTML passed via GET query params — will exceed URL length limits**
The `capture-email-screenshot` function passes the full email HTML as a URL query parameter:
```typescript
const params = new URLSearchParams({ html: html, ... });
const resp = await fetch(`https://api.screenshotone.com/take?${params}`);
```
Campaign HTML is typically 15-50KB. URL length limits are ~8KB in most servers, ~2KB in some browsers. This will fail for any real email. ScreenshotOne supports POST requests — the HTML should be sent as a POST body instead.

**Fix:** Switch to POST request to ScreenshotOne API.

### MODERATE Issues

**4. Model name `claude-sonnet-4-6-20251101` in visual-qa**
This model identifier is used in the `visual-qa` function. If Anthropic hasn't released this exact model ID, the API call will return a 400/404 error. Should verify this is a valid model, or fall back to `claude-sonnet-4-20250514` which is known to work (used in `sliceEmailImage.ts`).

**5. Edge functions not deployed**
The three new/updated edge functions (`capture-email-screenshot`, `slice-image-on-demand`, `visual-qa`) need to be deployed. They exist as code but may not be live yet.

### MINOR Issues

**6. `runVisualQa` triggers on `status === "ready"` (line 744)**
The previous conversation removed the `ready`/`variants_ready` status concept — campaigns should just be "draft" or unmarked. But the polling logic still checks for `status === "ready"` and triggers QA on it. This is a minor inconsistency but won't break anything since the status check is just a polling condition.

**7. No graceful timeout on the QA loop**
The full QA loop (render → slice → QA, up to 3x) runs entirely client-side with no timeout. If ScreenshotOne or Claude is slow, the user could be waiting 2-5 minutes with just "Running visual QA..." shown. Not a bug, but worth noting.

---

### Proposed Fix Plan

1. Run the database migration to add `visual_qa_status` and `visual_qa_score` columns
2. Update `config.toml` with `verify_jwt = false` for both new functions
3. Fix `capture-email-screenshot` to use POST instead of GET for the ScreenshotOne API
4. Verify/fix the Claude model ID in `visual-qa`
5. Deploy all three edge functions

