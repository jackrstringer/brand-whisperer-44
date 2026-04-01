

## Plan: Fix Timer, Persist Timer Toggle, AI Campaign Naming, and Wait for All Variants

### Issues Identified

1. **Timer shows 0:00 when returning to a generating campaign**: `CampaignsList` loads campaign data once but doesn't poll for updates. The `GenTimer` component reads `generation_started_at` correctly, but if you navigate away and back, the campaigns list re-fetches — the timer should work. The real issue is that `CampaignsList` doesn't re-fetch while you're on it, so a campaign that started generating while you were in the editor shows stale `status: "draft"` in the list. Need to add polling for active generations.

2. **Timer toggle resets on navigation**: `showTimers` is local `useState(false)`. Needs to persist in `localStorage`.

3. **Campaign stays "Untitled Campaign"**: In multi-variant mode, `_isSubGeneration: true` causes `generate-campaign` to return early before the naming logic. The `generate-campaign-multi` function never sets a name. Need to derive a name in the multi function immediately when generation starts.

4. **Variants visible before all are ready**: The frontend polls for `variants_ready` status, but the user can navigate into the campaign while it's still `generating` and see partial results. The real issue is: the campaign editor loads whatever is in the DB when you open it. If the campaign is still `generating`, it should show a generating state, not let you browse partial variants.

### Changes

**1. `src/pages/CampaignsList.tsx`**
- Persist `showTimers` in `localStorage` (`campaign-timers-visible`)
- Add a polling interval (every 5s) that re-fetches campaigns only when any campaign has `status === "generating"` — stops polling when none are generating
- Add `variants_ready` to `statusColors` map

**2. `supabase/functions/generate-campaign-multi/index.ts`**
- Right after marking `status: "generating"`, derive a campaign name from `brief` / `goal` (same logic as `generate-campaign` lines 820-841) and update the campaign name immediately — no AI call needed, just string extraction
- This gives the campaign a real name before variants even start

**3. `src/pages/CampaignEditor.tsx`**
- When loading a campaign that has `status === "generating"`, set `generating = true` and `genStartTime` from `generation_started_at` so the in-editor timer resumes correctly
- Start polling automatically for campaigns in `generating` state (reuse existing poll logic)
- When loading a campaign with `status === "generating"`, do NOT populate `variantHtmls` from partial data — wait until `variants_ready`

### Files Modified

| File | Action |
|------|--------|
| `src/pages/CampaignsList.tsx` | Persist timer toggle, add polling, add `variants_ready` status color |
| `supabase/functions/generate-campaign-multi/index.ts` | Add campaign naming logic at generation start |
| `src/pages/CampaignEditor.tsx` | Resume generating state + timer on load, block partial variant display |

