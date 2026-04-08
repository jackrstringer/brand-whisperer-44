

## Plan: Fix Klaviyo Sync — 30-Day Window + Proper Reporting API

### Problem Summary

1. **365-day window is too wide** — causes massive API load and rate limiting
2. **Wrong API for campaign stats** — current code makes 5 separate `/metric-aggregates` calls *per campaign* (N×5 requests). Klaviyo has a dedicated **Reporting API** (`POST /api/campaign-values-reports/`) that returns all stats for all campaigns in a **single request**
3. **No channel filtering** — the `/campaigns` filter uses `messages.channel='email'` but doesn't exclude flows; Klaviyo campaigns endpoint already only returns campaigns (not flows), but the metric-aggregates approach was pulling data by campaign *name* which could overlap with flow names
4. **Analyze prompt still says "365 days"** — needs to match the new 30-day window

### Changes

#### 1. `klaviyo-sync/index.ts` — Complete rewrite of data fetching strategy

**Campaign fetch (Step 1):**
- Change cutoff from 365 days to 30 days
- Keep the existing `/campaigns` endpoint call (this endpoint only returns campaigns, not flows — which is correct)

**Replace Steps 2+3 (metric resolution + per-campaign aggregation loop) with a single Reporting API call:**

```text
POST /api/campaign-values-reports/
{
  data: {
    type: "campaign-values-report",
    attributes: {
      statistics: [
        "recipients", "delivered", "opens_unique", "open_rate",
        "clicks_unique", "click_rate", "click_to_open_rate",
        "unsubscribes", "unsubscribe_rate",
        "conversion_uniques", "conversion_value",
        "revenue_per_recipient"
      ],
      timeframe: { key: "last_30_days" },
      conversion_metric_id: "<placed_order_metric_id>",
      filter: "equals(send_channel,\"email\")"
    }
  }
}
```

This returns one row per campaign with all stats pre-calculated — eliminates the entire batch loop and all per-campaign metric-aggregate calls. The `send_channel` filter ensures only email campaigns, not SMS.

**Still need the Placed Order metric ID** — fetch all metrics once, find "Placed Order" client-side (same pattern as quick-stats).

**Message details** — still fetch `/campaigns/{id}/campaign-messages` for subject lines and preview text, but now in parallel for all campaigns (much faster with only 30 days of data).

**Merge the reporting data with message details** into the final `campaignData` array.

**Update cached_stats** to use `campaigns_sent_l30d` and `total_revenue_l30d` (drop the `_l365d` variants).

#### 2. `analyze-klaviyo-performance/index.ts` — Update prompt

- Change "365 days" to "30 days" in the AI prompt text
- No other changes

#### 3. `klaviyo-quick-stats/index.ts` — No changes

The quick-stats function is already fetching 30-day data correctly.

#### 4. No other files changed

No UI changes, no migration needed, no changes to compile-klaviyo-context or klaviyo-proxy.

### Technical Detail: Rate Limit Impact

Current approach for 30 campaigns:
- 30 campaigns × 5 metrics = **150 POST requests** to `/metric-aggregates` (burst: 3/s)
- Plus 30 GET requests for message details
- Total: ~180 requests, heavily throttled

New approach:
- 1 GET `/metrics` to find Placed Order metric ID
- 1 POST `/campaign-values-reports/` for all stats (burst: 1/s, but only 1 call needed)
- ~N GET requests for message details (parallelized in batches)
- Total: ~32 requests for 30 campaigns

### What This Does NOT Change
- `klaviyo-quick-stats` — already working on 30-day window
- `compile-klaviyo-context` — no changes needed
- `KlaviyoSetup.tsx` — no UI changes
- `klaviyo-proxy` — no changes
- Any generation or campaign editor logic

