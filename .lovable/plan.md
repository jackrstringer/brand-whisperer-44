

## Plan: Improve Flow Email Design Quality, Auto-Load Previews, Arrow Navigation UX

### Problem Summary

1. **Weak reference adherence in flow mode**: The flow prompt says "follow its structure... Adapt for transactional content" — too loose. The user expects dupe-level fidelity.
2. **No auto-populated preview data**: After generation, the email shows raw Liquid tags until the user manually clicks "Load Recent Events" and picks one.
3. **Preview UX is a list of clickable cards**: User wants Klaviyo-style left/right arrow navigation with a clean formatted data summary instead of raw JSON.
4. **Bug**: `html` prop passed to FlowDetailsPanel is `flowPreviewHtml || campaign?.html` — after first preview render, subsequent renders use already-resolved HTML as the template, breaking switching.

---

### Changes

#### 1. Strengthen reference adherence in flow mode

**File**: `supabase/functions/_shared/generateCampaignCore.ts` (~line 919-925)

Replace the weak flow reference instruction with dupe-level language:

```
REFERENCE LAYOUT — EXACT STRUCTURAL CLONE REQUIRED.
Replicate this reference's structure EXACTLY:
- SAME number of sections, in the SAME order
- SAME column layouts and image slot positions
- SAME visual rhythm and spacing proportions
- ONLY adapt: swap in brand colors/fonts, replace static content slots with
  Liquid-templated transactional data (line items loop, order details, shipping info)
- Do NOT add or remove sections. Do NOT rearrange. The skeleton stays identical.
```

This brings flow mode in line with dupe mode's structural fidelity while still allowing transactional content adaptation.

#### 2. Auto-load preview events and render first one on generation complete

**File**: `src/components/campaign/FlowDetailsPanel.tsx`

- Add `useEffect` that auto-calls `loadPreviewEvents` on mount when `flowConfig.trigger_metric_id` exists and `html` is present.
- After events load, auto-render the first event's preview immediately (call `renderPreview(events[0])`).
- This means the email always shows with real data populated — never raw Liquid tags.

**File**: `src/pages/CampaignEditor.tsx` (~line 4444)

- Fix the html prop bug: always pass `campaign?.html || null` as the template source to FlowDetailsPanel, never the rendered preview HTML. The rendered HTML is only for display.

#### 3. Arrow navigation UX with formatted event data

**File**: `src/components/campaign/FlowDetailsPanel.tsx`

Replace the vertical list of event cards with:

- A compact navigator bar: `< 1 of 10 >` with left/right arrow buttons
- Clicking arrows calls `renderPreview` with the next/previous event
- Below the navigator, show a clean formatted summary card for the active event:
  - **Customer**: name, email
  - **Order**: order number, date, total
  - **Items**: product names with quantities (compact list, not raw JSON)
  - **Shipping**: formatted address
- This replaces the scrollable list of event buttons entirely
- Keep the liquid variables table as-is (it's useful)

---

### Technical Details

**html prop fix** (CampaignEditor.tsx line 4444):
```
html={campaign?.html || null}
```
Not `flowPreviewHtml || campaign?.html` — the template source must always be the original Liquid HTML.

**Auto-load flow** (FlowDetailsPanel):
```text
useEffect → loadPreviewEvents() when html + trigger_metric_id exist
  → on events loaded, auto-render events[0]
  → selectedIndex = 0
```

**Arrow navigator state**:
- `selectedIndex: number` replaces `selectedEventId: string | null`
- Left arrow: `setSelectedIndex(i => Math.max(0, i - 1))` + render
- Right arrow: `setSelectedIndex(i => Math.min(events.length - 1, i + 1))` + render

**Event data formatter** — extract and display cleanly:
- `event.extra.order_number` → Order #307583
- `event.extra.shipping_address` → formatted multi-line address
- `event.extra.line_items[]` → product name + qty + price rows
- `event.value` or `event.extra.total_price` → formatted total

