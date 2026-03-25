

# Fix Klaviyo Template Error + Enhance QA Page

## Issues to Fix

### 1. Klaviyo API Error: Missing `editor_type`
The Klaviyo API requires `editor_type` when creating templates. Both template creation points in `klaviyo-proxy/index.ts` are missing this field.

**Fix**: Add `editor_type: "CODE"` to the template attributes in both the `create-template` and `create-campaign` action handlers (lines 122-123 and 148-149).

### 2. QA Page Enhancements
The QA page currently has no Subject Line/Preview Text inputs, no segment selection, and no preset management. All of these need to be added to the right panel.

## Changes

### `supabase/functions/klaviyo-proxy/index.ts`
- Add `editor_type: "CODE"` to template creation payload in `create-template` action (line 123)
- Add `editor_type: "CODE"` to template creation payload in `create-campaign` action (line 149)

### `src/pages/CampaignQA.tsx`
Restructure the right panel to include above the QA checks:

1. **Subject Line input** with character counter (recommended < 60)
2. **Preview Text input** with character counter (recommended < 90)
3. **Segment Selector** — import and render the existing `SegmentSelector` component, wired to campaign's `send_list_ids` / `send_segment_ids`
4. Auto-save SL/PT/segment changes to the `campaigns` table on blur/change
5. Move action buttons (Export, Klaviyo Template, Create Campaign) to remain at the bottom

### `src/components/brand/SegmentSelector.tsx`
Enhance the existing component:
- Add a search/filter input for lists and segments (client-side filter by name)
- Add "Exclude" section — a second set of checkboxes for excluded segments/lists
- Update props to include `excludeListIds`, `excludeSegmentIds`
- Pass exclude IDs through to the QA page and Klaviyo proxy

### `supabase/functions/klaviyo-proxy/index.ts` (campaign creation)
- Update `create-campaign` to accept and apply `excludeListIds` / `excludeSegmentIds` in the Klaviyo campaign audience payload

### Database
No schema changes needed — `send_list_ids` and `send_segment_ids` already exist on campaigns. Exclude IDs can be stored as additional columns, requiring a small migration:
- Add `exclude_list_ids text[]` and `exclude_segment_ids text[]` to `campaigns`

## Files

| File | Change |
|------|--------|
| `supabase/functions/klaviyo-proxy/index.ts` | Add `editor_type: "CODE"`, handle exclude audiences |
| `src/pages/CampaignQA.tsx` | Add SL/PT inputs, segment selector, auto-save |
| `src/components/brand/SegmentSelector.tsx` | Add search filter, exclude section, updated props |
| Migration | Add `exclude_list_ids`, `exclude_segment_ids` to campaigns |

