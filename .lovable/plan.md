

# Single-Call Audit + Parallel Asset Categorization

## Problem

The audit currently makes **one Anthropic API call per campaign image** (up to 8 calls), then a synthesis call. That's 9 sequential/batched API calls taking 2-3 minutes. Claude supports up to 20 images per message — there's no reason not to send them all at once.

Additionally, asset categorization (logo, product, lifestyle) is happening inline during brand setup, blocking the flow. It should be fire-and-forget since it's only needed later for campaign generation.

## Changes

### 1. `supabase/functions/audit-brand/index.ts` — Single API call

Replace the current two-pass architecture (per-campaign audit + synthesis) with **one single API call**:

- Build one message containing ALL images from ALL campaigns, with text delimiters between campaigns (e.g., "--- Campaign 1 (3 slices) ---", "--- Campaign 2 (2 slices) ---")
- Send all images + the confirmed properties prefix in one Sonnet call
- The prompt asks for the unified audit directly — no synthesis pass needed
- Set `max_tokens: 8000` to accommodate the larger single response
- Remove all the per-campaign batching code, the synthesis call, and the post-processing border-force logic (per the previously approved plan to fix that)

This cuts the API calls from ~9 down to **1**.

### 2. `src/pages/BrandSetup.tsx` — Fire-and-forget asset analysis

Currently `generateGuideFromAudit` uploads assets and calls `analyze-asset` for each one, awaiting results before continuing. Change this:

- Asset uploads + AI analysis should be **fire-and-forget** — start the uploads/analysis in parallel but don't `await` them before proceeding to guide generation
- The brand analysis flow only needs: reference campaign images + logo. Nothing else.
- `getReferenceImageFiles()` already separates campaign files from asset files — only send campaign files + logo to the audit
- Asset categorization results get written to DB asynchronously; they'll be available when campaigns are generated later

### 3. Remove border-force post-processing

Lines 371-456 of `audit-brand/index.ts` contain the border evidence aggregation and force-override logic. This gets deleted since we're doing a single call and the AI should just report what it sees without post-processing overrides.

## Files to Change

1. **`supabase/functions/audit-brand/index.ts`** — Collapse to single API call, remove synthesis pass, remove border-force logic
2. **`src/pages/BrandSetup.tsx`** — Make asset upload/analysis fire-and-forget, don't block guide generation on it

