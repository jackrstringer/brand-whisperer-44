

# Klaviyo Integration — Full Technical Rundown

## Current State (What's Actually Happening in Production Right Now)

### Database State (verified via direct query just now)

| Field | Value |
|-------|-------|
| `sync_status` | `complete` |
| `quick_stats.active_profiles` | `null` |
| `quick_stats.campaigns_last_30d` | `21` |
| `quick_stats.revenue_last_30d` | `$682,223` |
| `active_profiles_segment_id` | `null` |
| `brand_intelligence` row | **DOES NOT EXIST** for this brand |

### Three Separate Bugs, Three Separate Root Causes

---

## Bug 1: Active Profiles Always `null` — Segment Creation Fails with 404

**What happens:** `klaviyo-quick-stats` tries to create a segment via `POST /api/segments/` using API revision `2024-02-15`. Klaviyo returns:

```
404: "No valid revisions found for method"
```

**Root cause:** The segment creation endpoint (`POST /api/segments/`) was introduced in a later API revision. Revision `2024-02-15` does not support it. The `additional-fields[segment]=profile_count` parameter on `GET /api/segments/{id}/` also requires a newer revision.

Per Klaviyo's docs, the minimum revision that supports both segment creation with `condition_groups` and the `profile_count` additional field is **`2024-06-15`** or later. The current code uses `2024-02-15` globally.

**Evidence from logs:**
```
[quick-stats] Creating new segment for active profiles...
[quick-stats] Profiles failed: Failed to create segment: 404: {"errors":[{"detail":"No valid revisions found for method"}]}
[quick-stats] Stats saved: { active_profiles: null, campaigns_last_30d: 21, revenue_last_30d: 682151 }
```

**The fix:** The segment-related calls (create segment, get segment with `profile_count`) need revision `2024-06-15` or later. The segment definition payload structure also needs verification against the docs — the current `dimension`/`operator`/`value` shape may not match Klaviyo's expected schema.

**Specifically, the segment definition currently uses:**
```json
{
  "type": "profile",
  "dimension": { "type": "email_marketing", "value": "can_receive_email_marketing" },
  "operator": { "id": "equals" },
  "value": true
}
```

Klaviyo's actual segment condition schema for `can_receive_email_marketing` needs to be verified against their OpenAPI spec. The schema uses a `ProfileGroupMembershipEnum` and boolean `is_member` pattern, not the free-form dimension/operator/value pattern above.

---

## Bug 2: `analyze-klaviyo-performance` Always Fails — No `brand_intelligence` Row Exists

**What happens:** `klaviyo-sync` saves campaign data via:
```typescript
await supabase.from("brand_intelligence").update({
  klaviyo_raw: campaignData,
  klaviyo_last_synced_at: new Date().toISOString(),
}).eq("brand_id", brandId);
```

**Root cause:** This is an `.update()`, not an `.upsert()`. The `brand_intelligence` table has **no row** for brand `23d41f2c-...`. An update on a non-existent row silently succeeds with 0 rows affected. So `klaviyo_raw` is never saved.

Then `analyze-klaviyo-performance` runs, queries `brand_intelligence` for `klaviyo_raw`, finds nothing, and throws:
```
Error: No Klaviyo raw data found
```

This is confirmed in logs — every single invocation of `analyze-klaviyo-performance` has failed with this exact error. The analysis has **never successfully run** for this brand.

**The fix:** Change the `.update()` in `klaviyo-sync` Step 6 to `.upsert()` with `brand_id` as the conflict key, ensuring the row is created if it doesn't exist.

---

## Bug 3: UI Says "Fetching 365 days" — Hardcoded Label

**What happens:** The backend was changed to 30 days, but the UI label on line 53 of `KlaviyoSetup.tsx` still says:
```typescript
{ status: "syncing", label: "Fetching 365 days of campaigns..." },
```

**The fix:** Change to `"Fetching 30 days of campaigns..."`.

---

## The Full Pipeline & What Should Happen

```text
User clicks "Connect & Sync"
  │
  ├─ Step 1: klaviyo-proxy (validate-key)
  │   └─ Validates API key, stores connection row
  │
  ├─ Step 2: klaviyo-quick-stats  ← BUG 1 (profiles fail)
  │   ├─ Active profiles (segment-based count)
  │   ├─ Campaign count (GET /campaigns with status=Sent filter)
  │   └─ Revenue (metric-aggregates on Placed Order)
  │
  └─ Step 3: klaviyo-proxy (sync-performance) → fires klaviyo-sync
       │
       ├─ klaviyo-sync
       │   ├─ Fetches sent campaigns (30d, email only) ✓ WORKS
       │   ├─ Finds Placed Order metric ID ✓ WORKS
       │   ├─ Campaign Values Report API ✓ WORKS (returns 21 results)
       │   ├─ Fetches subject lines per campaign ✓ WORKS
       │   ├─ Saves to brand_intelligence ← BUG 2 (update on missing row = no-op)
       │   ├─ Saves lists/segments/cached_stats ✓ WORKS
       │   └─ Fires analyze-klaviyo-performance
       │
       ├─ analyze-klaviyo-performance ← FAILS (no klaviyo_raw data)
       │   ├─ Reads brand_intelligence.klaviyo_raw → null
       │   └─ Throws "No Klaviyo raw data found"
       │
       └─ compile-klaviyo-context ← NEVER REACHED
           └─ Would compile prose briefing and set sync_status=complete
```

**Why does `sync_status` still reach `complete`?** Because `klaviyo-sync` sets `sync_status: "complete"` on line 260 *before* the async `analyze-klaviyo-performance` call returns. The analysis fires and fails in the background, but the sync has already marked itself done.

---

## What Needs to Change (4 Surgical Fixes)

### Fix 1: `klaviyo-quick-stats` — Upgrade revision for segment calls

Change the revision header from `2024-02-15` to `2024-06-15` (or later) specifically for the segment create and segment get calls. Verify the segment definition payload matches Klaviyo's actual schema.

### Fix 2: `klaviyo-sync` — Change `.update()` to `.upsert()` for `brand_intelligence`

```typescript
// Line 226: change from
await supabase.from("brand_intelligence").update({...}).eq("brand_id", brandId);
// to
await supabase.from("brand_intelligence").upsert({
  brand_id: brandId,
  klaviyo_raw: campaignData,
  klaviyo_last_synced_at: new Date().toISOString(),
}, { onConflict: "brand_id" });
```

This ensures the row exists before `analyze-klaviyo-performance` tries to read it.

### Fix 3: `klaviyo-sync` — Don't set `sync_status: "complete"` prematurely

The sync function currently sets `complete` before analysis finishes. It should set `sync_status: "syncing"` and leave it for the downstream functions to advance. `analyze-klaviyo-performance` sets it to `"analyzing"`, `compile-klaviyo-context` sets it to `"compiling"` then `"complete"`.

Remove the `sync_status: "complete"` from the `klaviyo-sync` update on line 260. Instead, only update lists/segments/cached_stats without touching `sync_status`.

### Fix 4: `KlaviyoSetup.tsx` — Fix hardcoded "365 days" label

Change line 53 from `"Fetching 365 days of campaigns..."` to `"Fetching 30 days of campaigns..."`.

---

## Summary for Your Senior Engineer

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `klaviyo-quick-stats` | Segment create/read uses revision `2024-02-15` which doesn't support the segments write endpoint or `profile_count` additional field | Upgrade revision to `2024-06-15`+ for segment API calls; verify condition payload schema |
| 2 | `klaviyo-sync` | `.update()` on `brand_intelligence` silently no-ops because no row exists; all downstream analysis fails | Change to `.upsert()` with `onConflict: "brand_id"` |
| 3 | `klaviyo-sync` | Sets `sync_status: "complete"` before analysis chain finishes | Remove premature `complete` — let `compile-klaviyo-context` set it |
| 4 | `KlaviyoSetup.tsx` | UI label says "365 days" | Change to "30 days" |

No other files need changes. `analyze-klaviyo-performance` and `compile-klaviyo-context` are correct — they just never get valid input because of bugs 2 and 3.

