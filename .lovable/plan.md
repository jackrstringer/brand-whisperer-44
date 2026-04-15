

## Plan: Route Calendar Date Ideas Through the Ideate Button

### Problem
After generating calendar dates, the "Generate ideas for X dates" button is stuck at the bottom of a long list, requiring the user to scroll down. The Ideate button in the ChatBar (always visible at the bottom) sits idle during this flow.

### Solution
Make the ChatBar's Ideate button and Enter key trigger `generateCalendarIdeas` when calendar dates are selected.

### Changes

**1. `src/hooks/useIdeation.ts`** — Expose a helper that returns the active calendar node info:
- Add a computed property `calendarDateSelection` that scans `state.nodes` for a `calendar_dates` node with `selectedDates.size > 0`
- Returns `{ nodeId, count }` or `null`
- Export it in the return object

**2. `src/components/ideation/ChatBar.tsx`** — Accept and use calendar date state:
- Add props: `calendarDateCount?: number`, `onGenerateCalendarIdeas?: () => void`
- In `handleSend`: if `calendarDateCount > 0` and input is empty, call `onGenerateCalendarIdeas()` instead of the normal send
- Light up the Ideate button (primary color) when `calendarDateCount > 0` (same treatment as `selectedCount > 0`)
- Show the count badge on Ideate when calendar dates are selected
- Update placeholder to mention "Press Enter to generate ideas for X dates..."

**3. `src/pages/IdeatePage.tsx`** — Wire the new props:
- Read `ideation.calendarDateSelection`
- Pass `calendarDateCount` and `onGenerateCalendarIdeas` to `ChatBar`
- The callback calls `ideation.generateCalendarIdeas(nodeId)`

**4. `src/components/ideation/CalendarDatesNode.tsx`** — Remove the bottom "Generate ideas" button:
- Delete lines 134-150 (the conditional button block)
- Remove `onGenerateIdeas` from props and `isGenerating` if no longer needed locally

### Behavior Summary
- User picks "Calendar Dates" → dates load in the node
- User checks dates → Ideate button lights up with count badge, placeholder updates
- User presses Enter or clicks Ideate → triggers `generateCalendarIdeas`
- No more scrolling to find a buried button

