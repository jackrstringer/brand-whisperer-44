
Do I know what the issue is? Yes.

Root cause from logs:
1) `audit-brand` completed successfully (`8 campaigns / 19 slices`).
2) `extract-brand` spec step completed and saved.
3) `extract-brand` guide step failed with upstream `502 Bad Gateway (cloudflare)` from Anthropic (`runGuideCall`), so `brand_guide_html` stayed null.
4) Frontend kept polling and the user experienced either a long wait or timeout.

## Fix plan (immediate)

1. Harden `extract-brand` guide generation against transient upstream failures  
   - File: `supabase/functions/extract-brand/index.ts`  
   - Add retry wrapper for Anthropic calls (`guide` and `spec`), with:
     - retry on `429/500/502/503/504`
     - exponential backoff + jitter
     - request timeout via `AbortController`
   - Keep model quality (no downgrade).

2. Reduce guide request execution risk (same quality, lower timeout probability)  
   - File: `supabase/functions/extract-brand/index.ts`
   - Lower `max_tokens` for guide from `64000` to a realistic ceiling (e.g. 12k–16k).
   - Send a compacted audit payload to guide generation (trim oversized arrays like long color lists / CTA lists while preserving required fields).
   - Preserve existing guide section structure exactly.

3. Make failure states explicit and instantly visible  
   - File: `supabase/functions/extract-brand/index.ts`
   - On start: write `_status: "guide_processing"` into `brand_profiles.audit_findings`.
   - On retry: update `_status: "guide_retrying"` with attempt count.
   - On final failure: write normalized `_error` message (human-readable, no raw HTML blob).

4. Improve polling behavior so users don’t sit on fake progress  
   - File: `src/pages/BrandSetup.tsx`
   - In poll loop, explicitly handle query errors (currently ignored).
   - If `_error` exists, stop polling immediately and show concise toast.
   - Update progress messaging to match current architecture (single-call audit + async guide), and avoid “stuck at near-complete” feel.

5. Clean up current console warnings (non-blocking but should be fixed)  
   - Files: `src/components/brand/ResourceUploader.tsx`, `src/components/brand/AssetCategoryUploader.tsx`, `src/pages/BrandSetup.tsx`
   - Remove/refactor ref propagation path causing “Function components cannot be given refs” warnings.

## Technical details (for engineer audit)

- Current failing path: `BrandSetup.generateGuideFromAudit()` -> `extract-brand(step:"guide")` -> `runGuideCall()` (single large Anthropic request).
- Confirmed failure timestamp in logs: `07:49:12Z`, error: `Guide API error: 502`.
- Data state after failure: `brand_profiles.audit_findings._error` set; `brand_guide_html` null.
- Primary reliability gap: one-shot external call with no retry and oversized output budget.

## Verification after implementation

1) Run a full brand analysis with same workload (Figma + website + ~8 refs).  
2) Confirm logs show retry handling if transient errors occur, and eventual success writes `brand_guide_html`.  
3) Confirm UI exits immediately on real failure (no 5-minute dead wait).  
4) Confirm no ref warnings in console on `/brands/new`.
