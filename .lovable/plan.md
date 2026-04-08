

# Klaviyo OAuth Data Layer + Performance Intelligence

## Overview

Replace the existing private-API-key Klaviyo integration with a full OAuth 2.0 flow, pull 365 days of campaign performance data, analyze it with AI, and inject the intelligence into every campaign generation prompt.

## Current State

- `klaviyo_connections` table exists with `api_key_encrypted`, `cached_lists`, `cached_segments` columns (private key model)
- `klaviyo-proxy` edge function handles validate-key, sync, create-template, create-campaign, disconnect
- `KlaviyoSetup.tsx` component uses private API key input
- `brand_intelligence` table has no Klaviyo-related columns
- Generation pipeline fetches `compiled_context` from `brand_intelligence` and injects it

## Prerequisites (User Action Required)

Before implementation, three secrets must be added:
- `KLAVIYO_CLIENT_ID` — from Klaviyo developer app registration
- `KLAVIYO_CLIENT_SECRET` — from Klaviyo developer app registration  
- `KLAVIYO_REDIRECT_URI` — set to `https://wauepdkxqhyndsmjzita.supabase.co/functions/v1/klaviyo-callback`

## Database Changes

### Migration 1: Add Klaviyo columns to `brand_intelligence`

```sql
ALTER TABLE brand_intelligence
  ADD COLUMN klaviyo_raw jsonb,
  ADD COLUMN klaviyo_report jsonb,
  ADD COLUMN klaviyo_compiled text,
  ADD COLUMN klaviyo_last_synced_at timestamptz;
```

### Migration 2: Rebuild `klaviyo_connections` for OAuth

Drop and recreate `klaviyo_connections` to support OAuth tokens instead of private API keys. Preserve RLS. Add `sync_status`, `sync_error`, `access_token`, `refresh_token`, `token_expires_at`, `klaviyo_account_id`, `klaviyo_account_name`. Remove `api_key_encrypted`. Keep `cached_lists`, `cached_segments` for existing list/segment sync. Use a validation trigger for `sync_status` instead of CHECK constraint.

## Edge Functions

### 1. `klaviyo-connect` (new)

- Takes `brand_id` as query param
- Validates user auth via JWT
- Builds Klaviyo OAuth authorize URL with scopes: `campaigns:read metrics:read lists:read profiles:read`
- Uses `state` param = `{brand_id}:{user_jwt}` (signed/encoded to prevent CSRF)
- Returns 302 redirect to Klaviyo

### 2. `klaviyo-callback` (new)

- Handles OAuth redirect with `code` and `state` query params
- Exchanges code for access/refresh tokens via `POST https://a.klaviyo.com/oauth/token`
- Fetches account info via `GET https://a.klaviyo.com/api/accounts/`
- Upserts into `klaviyo_connections` with tokens, account ID, account name
- Fires `klaviyo-sync` as fire-and-forget via `EdgeRuntime.waitUntil()`
- Redirects user back to brand settings with `?klaviyo=connected`

Config: `verify_jwt = false` (handles callback from Klaviyo, not from our frontend)

### 3. `klaviyo-sync` (new)

Main data pull function. Takes `brand_id`.

**Step 1**: Fetch all sent campaigns from last 365 days via paginated `GET /api/campaigns/` with filter on channel=email and scheduled_at >= 365 days ago. Only keep status=sent.

**Step 2**: Resolve metric IDs once via `GET /api/metrics/` (find Opened Email, Clicked Email, Unsubscribed, Placed Order, Received Email by name).

**Step 3**: For each sent campaign (batches of 10, parallel within batch), fetch metrics via `POST /api/metric-aggregates/` for each metric type. Calculate open rate, click rate, CTR, unsubscribe rate, revenue per recipient.

**Step 4**: Assemble raw data array. Save as `klaviyo_raw` in `brand_intelligence`. Update `klaviyo_last_synced_at`.

**Step 5**: Fire `analyze-klaviyo-performance` as fire-and-forget.

Also sync lists/segments into `cached_lists`/`cached_segments` on `klaviyo_connections` (preserves existing functionality).

### 4. `analyze-klaviyo-performance` (new)

- Fetches `klaviyo_raw` from `brand_intelligence`
- Calls Claude Sonnet with the structured JSON report schema (top/worst performers, subject line intelligence, offer performance, content intelligence, list health, recommendations)
- Saves parsed JSON as `klaviyo_report`
- Fires `compile-klaviyo-context` as fire-and-forget

### 5. `compile-klaviyo-context` (new)

- Fetches `klaviyo_report` from `brand_intelligence`
- Calls Claude Sonnet to convert report into concise prose briefing (~800 tokens)
- Saves as `klaviyo_compiled`
- Calls existing `compile-brand-context` to regenerate master `compiled_context`

### 6. Update `klaviyo-proxy` (existing)

- Change `validate-key` action → remove (replaced by OAuth)
- Update all actions to read `access_token` instead of `api_key_encrypted`
- Add token refresh logic: if `token_expires_at` is past, use `refresh_token` to get new access token before making API calls
- Keep: `sync`, `get-cached`, `create-template`, `create-campaign`, `disconnect`

## Generation Prompt Injection

**File: `supabase/functions/_shared/generateCampaignCore.ts`**

Two-line change at line 395: add `klaviyo_compiled` to the select query. Then inject after `brandIntelBlock`:

```typescript
const klaviyoBlock = brandIntelResult.data?.klaviyo_compiled
  ? `\n\nKLAVIYO PERFORMANCE INTELLIGENCE:\n${brandIntelResult.data.klaviyo_compiled}`
  : '';
```

Inject `klaviyoBlock` into `brandRulesText` and `brandValuesText` alongside `brandIntelBlock`.

## UI: Updated KlaviyoSetup Component

**File: `src/components/brand/KlaviyoSetup.tsx`**

Replace private API key input with OAuth flow:

**Not connected state:**
- "Connect Klaviyo" button → opens `klaviyo-connect` URL via `window.open()` (same pattern as Shopify OAuth)
- Listen for `?klaviyo=connected` query param to refresh state

**Connected state:**
- Account name + connection date
- Sync status badge (pending / syncing / complete / failed) with last synced timestamp
- "Re-sync Data" button → calls `klaviyo-sync`
- Collapsible "Performance Report" section: total campaigns, avg open rate, avg click rate, avg RPR, best send days (from `klaviyo_report.summary`)
- Collapsible "Top Performing Campaigns" table: name, subject line, open rate, RPR (from `klaviyo_report.top_performers`)
- Collapsible "Subject Line Intelligence": patterns that work/flop, best examples (from `klaviyo_report.subject_line_intelligence`)
- Collapsible "AI Context Preview": read-only text of `klaviyo_compiled`

**File: `src/pages/BrandSettings.tsx`**
- Check for `?klaviyo=connected` query param on mount, show success toast, refresh KlaviyoSetup

## Config

**File: `supabase/config.toml`**
- Add `[functions.klaviyo-callback]` with `verify_jwt = false`

## File Summary

| File | Action |
|------|--------|
| DB migration: `brand_intelligence` columns | Add 4 columns |
| DB migration: `klaviyo_connections` rebuild | Drop/recreate for OAuth |
| `supabase/functions/klaviyo-connect/index.ts` | New |
| `supabase/functions/klaviyo-callback/index.ts` | New |
| `supabase/functions/klaviyo-sync/index.ts` | New |
| `supabase/functions/analyze-klaviyo-performance/index.ts` | New |
| `supabase/functions/compile-klaviyo-context/index.ts` | New |
| `supabase/functions/klaviyo-proxy/index.ts` | Update for OAuth tokens |
| `supabase/functions/_shared/generateCampaignCore.ts` | 3-line injection |
| `src/components/brand/KlaviyoSetup.tsx` | Rewrite for OAuth + reports |
| `src/pages/BrandSettings.tsx` | Add callback detection |
| `supabase/config.toml` | Add callback function config |

