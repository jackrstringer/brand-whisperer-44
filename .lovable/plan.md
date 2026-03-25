

# Klaviyo Integration + Pre-Send QA System

## Overview

Connect each brand to a Klaviyo account via API key, enabling one-click export of campaigns as Klaviyo templates or live campaigns. Add subject line/preview text fields, segment/list selection with saved presets per brand, and a comprehensive pre-send QA review page.

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Campaign    │────▶│  QA Review Page  │────▶│  Send to     │
│  Editor      │     │  (pre-send)      │     │  Klaviyo     │
│              │     │                  │     │  Edge Fn     │
│ + SL/PT      │     │ - Link audit     │     │              │
│   fields     │     │ - Spell check    │     │ - Template   │
│              │     │ - Visual check   │     │ - Campaign   │
│ + Segment    │     │ - SL/PT check    │     │              │
│   selector   │     │                  │     │              │
└─────────────┘     └──────────────────┘     └──────────────┘
```

## Database Changes (1 migration)

1. **`klaviyo_connections` table** -- stores per-brand Klaviyo API key reference and cached lists/segments
   - `id`, `brand_id` (FK), `api_key_name` (text, references the secret name), `cached_lists` (jsonb), `cached_segments` (jsonb), `last_synced_at`, `created_at`

2. **`brand_segment_presets` table** -- saved segment/list combos per brand
   - `id`, `brand_id`, `name` (text), `list_ids` (text[]), `segment_ids` (text[]), `created_at`

3. **Add columns to `campaigns` table**:
   - `subject_line` (text, nullable)
   - `preview_text` (text, nullable)
   - `send_list_ids` (text[], nullable)
   - `send_segment_ids` (text[], nullable)
   - `klaviyo_template_id` (text, nullable)
   - `klaviyo_campaign_id` (text, nullable)

## Edge Functions (2 new)

### `klaviyo-proxy/index.ts`
Single proxy edge function for all Klaviyo API calls. Uses the stored Klaviyo private API key (stored as a secret per brand, e.g. `KLAVIYO_KEY_{brandId short}`). Endpoints:

- **GET /lists** -- fetches all lists from Klaviyo, caches in `klaviyo_connections`
- **GET /segments** -- fetches all segments, caches
- **POST /template** -- creates a Klaviyo template from campaign HTML
- **POST /campaign** -- creates a Klaviyo campaign: creates template, creates campaign, assigns template to campaign message, assigns lists/segments as audiences
- **POST /validate-key** -- tests the API key

Uses Klaviyo API revision `2026-01-15`. All calls go to `https://a.klaviyo.com/api/` with header `Authorization: Klaviyo-API-Key {key}` and `revision: 2026-01-15`.

### `qa-campaign/index.ts`
Pre-send QA edge function. Receives campaign HTML + subject line + preview text. Uses AI (Lovable AI / Gemini Flash) to check:
- Spelling/grammar in HTML body text
- Spelling/grammar in subject line and preview text
- Extracts all links, checks each is valid and within brand domain
- Flags visual issues (missing alt tags, broken image patterns, empty sections)

Returns structured JSON with pass/fail per category and specific issues.

## Frontend Changes

### 1. Klaviyo Connection Setup (Brand Settings)
New tab "Klaviyo" in `BrandSettings.tsx`:
- Input field for Klaviyo Private API Key
- "Connect" button that validates the key via `klaviyo-proxy` and stores it as a secret
- Once connected: shows account status, "Sync Lists & Segments" button
- The API key is stored using the `add_secret` tool pattern

### 2. Subject Line & Preview Text (Campaign Editor)
Add to the campaign editor left panel (both in draft form and post-generation):
- **Subject Line** input field (persisted to `campaigns.subject_line`)
- **Preview Text** input field (persisted to `campaigns.preview_text`)
- Character count indicators (SL recommended < 60 chars, PT < 90 chars)

### 3. Segment/List Selector (Campaign Editor)
Below SL/PT fields when a Klaviyo connection exists:
- Multi-select for Lists and Segments (fetched from cached data)
- "Save as Preset" button to store the current selection
- Dropdown to load a saved preset
- Persisted to `campaigns.send_list_ids` / `send_segment_ids`

### 4. QA Review Page (`src/pages/CampaignQA.tsx`)
New route: `/brands/:brandId/campaigns/:campaignId/qa`

Accessed via "Review & Send" button in campaign editor (replaces/supplements current Export button).

Layout:
- **Left column**: Campaign preview (reuse iframe renderer)
- **Right column**: QA checklist with status indicators

QA Checks displayed:
1. **Links Audit** -- table of all links found, each with status badge (valid/broken/external), domain match indicator
2. **Content Spelling & Grammar** -- list of flagged issues in campaign body with location context
3. **Subject Line & Preview Text** -- separate spell/grammar check, character length warnings
4. **Visual Integrity** -- missing alt tags, empty sections, image load status
5. **Brand Compliance** -- colors match brand palette, fonts correct

Each section shows green checkmark or red warning with details expandable.

Bottom action bar:
- "Export as Template" -- pushes HTML to Klaviyo as a template only
- "Create Campaign" -- creates a full Klaviyo campaign with selected audiences, ready to schedule/send in Klaviyo
- "Export HTML" -- existing download behavior

### 5. Campaign Editor Top Bar Update
Add "Review & Send" button next to existing "Export HTML" button. Navigates to QA page.

## Secret Management
The Klaviyo API key will be stored using the `add_secret` tool as `KLAVIYO_API_KEY`. Since this is a per-account (not per-brand) key in most Klaviyo setups, one key per user account is sufficient. If the user has multiple Klaviyo accounts, the `klaviyo_connections` table supports per-brand keys.

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/xxx.sql` | New tables + campaign columns |
| `supabase/functions/klaviyo-proxy/index.ts` | New edge function |
| `supabase/functions/qa-campaign/index.ts` | New edge function |
| `src/pages/CampaignQA.tsx` | New QA review page |
| `src/pages/CampaignEditor.tsx` | Add SL/PT fields, segment selector, "Review & Send" button |
| `src/pages/BrandSettings.tsx` | Add Klaviyo tab |
| `src/components/brand/KlaviyoSetup.tsx` | New component for Klaviyo connection |
| `src/components/brand/SegmentSelector.tsx` | New component for list/segment picker with presets |
| `src/lib/types.ts` | Add new types |
| `src/App.tsx` | Add QA route |

