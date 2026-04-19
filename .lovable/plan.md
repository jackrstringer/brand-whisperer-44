
## Kill-switch plan — stop credit burn before any more fixes

Four targeted changes. No architecture work. No model changes. No silent fallbacks.

### 1. Rate limit guard in `src/pages/BrandSetup.tsx`
Before `supabase.functions.invoke("audit-brand", ...)`:
- Query: select `brand_profiles.processing_status, audit_findings, created_at` joined to `brands` filtered by `brands.user_id = auth.uid()` and `brand_profiles.created_at > now() - 1 hour`.
- Count rows where `processing_status = 'failed'` OR `audit_findings->>'_error' IS NOT NULL`.
- If count >= 2: show blocking alert ("Rate limit: 2+ failed brand setups in the last hour. Wait before retrying to avoid burning API credits.") and `return`. No invoke fires.

### 2. Dev-mode confirm gate in `src/pages/BrandSetup.tsx`
Add a small helper:
```ts
function confirmDevSpend(fnName: string): boolean {
  if (!import.meta.env.DEV) return true;
  return window.confirm(`About to call ${fnName}. This will cost real money. Continue?`);
}
```
Gate the three invoke sites:
- Before `audit-brand` invoke → `if (!confirmDevSpend("audit-brand")) return;`
- Before `extract-brand` (spec mode) invoke → same guard.
- Before `extract-brand` (guide mode) fetch → same guard.

### 3. Persist parse failures in `supabase/functions/audit-brand/index.ts`
- Ensure request body accepts `brandId` (frontend already has it during initial setup; pass it through — if missing, log a warning and continue without DB write).
- Wrap the `extractJsonObject(...)` call in try/catch.
- On parse failure, BEFORE re-throwing:
  - If `brandId` present: `supabase.from("brand_profiles").update({ processing_status: "failed", processing_error: <msg>, audit_findings: { _error: <msg>, _raw_snippet: rawText.slice(0, 2000) } }).eq("brand_id", brandId)` inside its own try/catch (do not let the DB write error mask the original parse error).
  - Then throw the original parse error so the function returns 500 with the real message.
- Frontend `BrandSetup.tsx` already calls `audit-brand` before the profile row is created, so also handle the case where `brandId` is undefined: skip the DB write, just log and throw.

### 4. Hard stop on audit failure in `src/pages/BrandSetup.tsx`
- Locate the `startAudit` flow and the catch block that currently proceeds to `generateGuideFromAudit` (or equivalent next step).
- Replace any silent continuation with:
  - Set step to a `failed` state.
  - Surface the raw audit error message in the UI (red alert with full message + copy button).
  - Explicitly do NOT call `extract-brand` (spec or guide), do NOT create the brand row, do NOT navigate.
- Add a single console.error with `[BrandSetup] Audit failed, halting pipeline:` for log clarity.

### Deploy
- Deploy `audit-brand`. Report timestamp.
- Frontend changes ship via the build (no separate deploy).

### Out of scope (per your instruction)
- No architecture rewrite of the two-screen flow.
- No changes to extract-brand transactional logic.
- No model swaps. No prompt changes. No retries.
