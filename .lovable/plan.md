

# Fix Klaviyo Sync Errors + Improve Stats Display

## Problems Found

1. **`page_size` error on campaigns endpoint**: `URLSearchParams` encodes `page[size]` → `page%5Bsize%5D`, which Klaviyo rejects. The query string must contain literal `page[size]=50`, not percent-encoded brackets.

2. **`page_size` in metric-aggregates body** (line 135): While `page_size` is valid for metric-aggregates, it's inside the JSON body so it's not causing the current error. However, the `filter` field uses `Campaign Name` string matching which is fragile. We should keep this as-is for now since it's not the blocking issue.

3. **Segments not detected properly**: The `GET /segments` call doesn't filter by `is_active`, so it returns all segments including inactive/archived ones.

4. **Stats cards show list/segment counts**: Not useful. Should show active profiles (email-subscribed), campaigns sent L30D, and last sync time.

## Changes

### 1. Fix `fetchAllPages` in `klaviyo-sync`

**File: `supabase/functions/klaviyo-sync/index.ts`**

Replace `fetchAllPages` to build the query string manually (without URLSearchParams) so brackets stay literal:

```typescript
async function fetchAllPages(path: string, apiKey: string, params?: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  // Build query string manually to preserve literal brackets
  const qs = params
    ? Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
  let url = `${path}${qs ? `?${qs}` : ""}`;
  while (url) {
    const data = await klaviyoFetch(url, apiKey);
    if (data.data) all.push(...data.data);
    const nextLink = data.links?.next;
    if (nextLink) {
      try {
        const nextUrl = new URL(nextLink);
        // Strip /api prefix since klaviyoFetch prepends it
        url = `${nextUrl.pathname}${nextUrl.search}`.replace("/api", "");
      } catch {
        url = null as any;
      }
    } else {
      url = null as any;
    }
  }
  return all;
}
```

### 2. Filter segments to active only

**File: `supabase/functions/klaviyo-sync/index.ts`** (Step 5, line ~211)

Change the segments fetch to filter by `is_active`:
```typescript
klaviyoFetch("/segments?filter=equals(is_active,true)", apiKey)
```

Also update `klaviyo-proxy` sync action (line ~146) with the same filter.

### 3. Add account stats to `klaviyo-sync`

**File: `supabase/functions/klaviyo-sync/index.ts`**

After the campaigns + metrics processing, add a step to count email-subscribed profiles. Klaviyo doesn't expose a simple "count" endpoint, but we can use the profiles endpoint with a `page[size]=1` request filtered to email-subscribed profiles and read the pagination metadata. Alternatively, we can count campaigns sent in L30D from the already-fetched data.

Add a new step before saving to `klaviyo_connections`:
- Count campaigns sent in last 30 days from the `campaignData` array (already computed)
- Fetch total profile count via `GET /profiles?page[size]=1` and read the total from response (Klaviyo doesn't return totals this way, so we'll use segment member counts instead)

Actually, the simplest reliable approach: fetch the "Newsletter" or main list's profile count, or use `GET /profiles?page[size]=1&filter=equals(subscriptions.email.marketing.consent,"SUBSCRIBED")` — but Klaviyo's profile filtering is limited.

**Revised approach**: Store `campaigns_sent_l30d` and `total_campaigns_l365d` as computed stats from the already-fetched data. For active profiles, we'll get the count from the largest list (which is typically the main email list). Lists have a `profile_count` attribute we can request.

Update the lists fetch to include `fields[list]=name,profile_count`:
```typescript
klaviyoFetch("/lists?fields[list]=name,profile_count", apiKey)
```

Then compute `active_profiles` as the max `profile_count` across all lists, and `campaigns_sent_l30d` from the campaign data.

### 4. Add `cached_stats` column to `klaviyo_connections`

**Migration**: Add a jsonb column to store computed stats:
```sql
ALTER TABLE klaviyo_connections ADD COLUMN IF NOT EXISTS cached_stats jsonb DEFAULT '{}';
```

Save stats like:
```json
{
  "active_profiles": 45000,
  "campaigns_sent_l30d": 12,
  "campaigns_sent_l365d": 156,
  "total_revenue_l365d": 23456.78
}
```

### 5. Update UI stats cards

**File: `src/components/brand/KlaviyoSetup.tsx`**

Replace the "Lists" and "Segments" stat cards with:
- **Active Profiles** (email-subscribed, from largest list)
- **Campaigns L30D** (campaigns sent in last 30 days)
- **Total Revenue** (from synced campaign data, if available)

Keep the "Sync Lists & Segments" button since SegmentSelector still uses `cached_lists` and `cached_segments`.

### 6. Update `klaviyo-proxy` validate-key

**File: `supabase/functions/klaviyo-proxy/index.ts`**

Update the validate-key action to also fetch lists with `profile_count` field and compute initial stats.

## File Summary

| File | Change |
|------|--------|
| DB migration | Add `cached_stats` jsonb column to `klaviyo_connections` |
| `supabase/functions/klaviyo-sync/index.ts` | Fix `fetchAllPages` encoding, filter active segments, compute stats |
| `supabase/functions/klaviyo-proxy/index.ts` | Filter active segments in sync action, fetch list profile counts |
| `src/components/brand/KlaviyoSetup.tsx` | Replace list/segment cards with active profiles, campaigns L30D, revenue |

