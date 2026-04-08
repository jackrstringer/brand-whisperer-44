

## Fix: Active Profiles Count Shows 6,284 Instead of 63,000

### Two Bugs, Not One

**Bug A: Wrong segment definition** (already identified)
The `consent_status: { subscription: "subscribed" }` sub-filter restricts to explicitly opted-in profiles only. Needs to be removed so the condition is just "can receive email marketing" with no sub-qualification.

**Bug B: Polling exits on first non-zero count (the unidentified bug)**
Line 136 of `klaviyo-quick-stats`:
```typescript
if (count !== null && count !== undefined && count > 0) {
  return count;
}
```

When Klaviyo creates or re-evaluates a segment, `profile_count` is computed **asynchronously**. Klaviyo doesn't jump from 0 to 63,000 instantly — it incrementally processes profiles. The polling loop returns the **first non-zero intermediate result** (e.g. 6,284 after 3 seconds) instead of waiting for the count to stabilize at the true total.

This is why even if we fix the segment definition, we'd likely still get a wrong (low) number — the function grabs whatever partial count Klaviyo has computed so far and calls it done.

### The Fix

#### 1. `klaviyo-quick-stats/index.ts` — Fix segment definition

Remove `consent_status` block entirely:
```json
{
  "type": "profile-marketing-consent",
  "consent": {
    "channel": "email",
    "can_receive_marketing": true
  }
}
```

#### 2. `klaviyo-quick-stats/index.ts` — Fix polling to wait for count stabilization

Replace the "return on first non-zero" logic with a stabilization check: poll until the count stops changing between consecutive reads, or until timeout.

```typescript
let lastCount = -1;
let stableRounds = 0;

for (let attempt = 0; attempt < 10; attempt++) {
  if (attempt > 0) await new Promise(r => setTimeout(r, 3000));

  const countData = await klaviyoGet(
    `/segments/${segmentId}/?additional-fields[segment]=profile_count`,
    apiKey, SEGMENT_REVISION
  );
  const count = countData?.data?.attributes?.profile_count;

  if (count !== null && count !== undefined && count > 0) {
    if (count === lastCount) {
      stableRounds++;
      if (stableRounds >= 2) return count; // same value 3 reads in a row = stable
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }
}
// If we exhausted attempts, return whatever we last saw (better than null)
return lastCount > 0 ? lastCount : null;
```

This waits for the count to be the same across 3 consecutive polls (9 seconds of stability) before accepting it. For a segment that already exists and is fully computed, it returns on the 3rd poll (~6 seconds). For a newly created segment, it gives Klaviyo up to 30 seconds to finish processing.

#### 3. Clear stale segment ID (data update)

The stored segment `Uh57bW` was created with the wrong definition. We need to:
- NULL out `active_profiles_segment_id` in the DB so the function creates a fresh segment
- Add cleanup logic: if the function finds an existing segment by name search, delete it before creating the correct one

#### 4. No other files change

### Summary

| # | What | Why |
|---|------|-----|
| 1 | Remove `consent_status` from segment definition | Current definition only counts explicitly subscribed (6K), not all contactable (63K) |
| 2 | Poll for count stabilization instead of first non-zero | Klaviyo computes `profile_count` asynchronously; first non-zero value is a partial/intermediate result |
| 3 | Clear stored segment ID + delete old segment | Force recreation with correct definition |

