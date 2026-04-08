

# Klaviyo Data Layer — API Key + Performance Intelligence

## Overview

Keep the existing API-key connection model (no OAuth), add 365-day campaign data pull, AI analysis, and inject intelligence into generation prompts. No `klaviyo-connect` or `klaviyo-callback` edge functions.

## Database Changes

### Migration 1: Add Klaviyo columns to `brand_intelligence`
```sql
ALTER TABLE brand_intelligence
  ADD COLUMN klaviyo_raw jsonb,
  ADD COLUMN klaviyo_report jsonb,
  ADD COLUMN klaviyo_compiled text,
  ADD COLUMN klaviyo_last_synced_at timestamptz;
```

### Migration 2: Rebuild `klaviyo_connections` for new schema
Drop existing table and recreate with `api_key` (plain text, not `api_key_encrypted`), plus sync status columns. Use a validation trigger instead of CHECK constraint.

```sql
DROP TABLE IF EXISTS klaviyo_connections;

CREATE TABLE klaviyo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  klaviyo_account_id text,
  klaviyo_account_name text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'pending',
  sync_error text,
  cached_lists jsonb DEFAULT '[]',
  cached_segments jsonb DEFAULT '[]',
  UNIQUE(brand_id)
);

ALTER TABLE klaviyo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their klaviyo connections"
  ON klaviyo_connections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM brands WHERE brands.id = klaviyo_connections.brand_id AND brands.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION validate_klaviyo_sync_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.sync_status NOT IN ('pending', 'syncing', 'complete', 'failed') THEN
    RAISE EXCEPTION 'Invalid sync_status: %', NEW.sync_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_klaviyo_sync_status
  BEFORE INSERT OR UPDATE ON klaviyo_connections
  FOR EACH ROW EXECUTE FUNCTION validate_klaviyo_sync_status();
```

## Edge Functions

### 1. Update `klaviyo-proxy` (existing)
- Change `validate-key` action: call `GET /api/accounts/` to validate key and get account name, then upsert into `klaviyo_connections` with `api_key`, `klaviyo_account_id`, `klaviyo_account_name`
- Read `api_key` instead of `api_key_encrypted` from `klaviyo_connections`
- After successful validate-key, fire `klaviyo-sync` as fire-and-forget

### 2. `klaviyo-sync` (new)
Takes `brand_id`. Reads `api_key` from `klaviyo_connections`.

- Step 1: Fetch sent campaigns from last 365 days via paginated `GET /api/campaigns/`
- Step 2: Resolve metric IDs via `GET /api/metrics/` (Opened Email, Clicked Email, Unsubscribed, Placed Order, Received Email)
- Step 3: For each campaign (batches of 10), fetch metrics via `POST /api/metric-aggregates/`
- Step 4: Assemble raw data, save as `klaviyo_raw` in `brand_intelligence`
- Step 5: Also sync lists/segments into `cached_lists`/`cached_segments`
- Step 6: Fire `analyze-klaviyo-performance` as fire-and-forget

### 3. `analyze-klaviyo-performance` (new)
- Fetch `klaviyo_raw` from `brand_intelligence`
- Call Lovable AI (Claude Sonnet) with structured JSON report schema covering: summary stats, top/worst performers, subject line intelligence, offer performance, content intelligence, list health, recommendations
- Save as `klaviyo_report`
- Fire `compile-klaviyo-context`

### 4. `compile-klaviyo-context` (new)
- Fetch `klaviyo_report`
- Call Claude Sonnet to convert into ~800-token prose briefing
- Save as `klaviyo_compiled`
- Trigger `compile-brand-context` to regenerate master `compiled_context`

## Generation Prompt Injection

**File: `supabase/functions/_shared/generateCampaignCore.ts`** (line ~395)

Add `klaviyo_compiled` to the select query, then inject:
```typescript
const klaviyoBlock = brandIntelResult.data?.klaviyo_compiled
  ? `\n\nKLAVIYO PERFORMANCE INTELLIGENCE:\n${brandIntelResult.data.klaviyo_compiled}`
  : '';
```

## UI Changes

**File: `src/components/brand/KlaviyoSetup.tsx`**

Keep the existing API key input form (already there). Enhance the connected state to show:
- Account name and sync status badge
- "Re-sync Performance Data" button → calls `klaviyo-sync`
- Collapsible sections: Performance Summary, Top Campaigns, Subject Line Intelligence, AI Context Preview
- Fetch `brand_intelligence` for `klaviyo_report` and `klaviyo_compiled` to populate these sections

**File: `src/pages/BrandSettings.tsx`**
- No changes needed (already renders KlaviyoSetup)

## File Summary

| File | Action |
|------|--------|
| DB migration: `brand_intelligence` columns | Add 4 columns |
| DB migration: `klaviyo_connections` rebuild | Drop/recreate with `api_key` |
| `supabase/functions/klaviyo-proxy/index.ts` | Update validate-key to use `/accounts/`, fire sync |
| `supabase/functions/klaviyo-sync/index.ts` | New — 365-day data pull |
| `supabase/functions/analyze-klaviyo-performance/index.ts` | New — AI analysis |
| `supabase/functions/compile-klaviyo-context/index.ts` | New — prose briefing |
| `supabase/functions/_shared/generateCampaignCore.ts` | 3-line injection |
| `src/components/brand/KlaviyoSetup.tsx` | Add report display sections |

