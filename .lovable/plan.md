
Goal
- Fix hover darkening so every calendar day tile visibly darkens on hover.
- Make the calendar fill the full task panel and become actually vertically scrollable.

What the code audit showed
- The hover tint is broken because `TaskCalendarView` uses `backgroundColor: 'hsl(var(--muted) / 0.7)'`, but `--muted` is defined as a hex token in `src/index.css`, not an HSL channel. The browser drops that style, so the tile never darkens.
- The current calendar only renders one month and does not use `onRequestMonths`, so it is not using the existing scrollable month-loading pattern at all.
- With only 4–6 fixed `100px` week rows, the rendered month often stops around mid-panel, which is why it looks like it only takes up half the screen.

Implementation plan
1. Fix the hover state in `src/components/ideation/TaskCalendarView.tsx`
   - Remove the broken inline HSL background logic.
   - Add a dedicated `pointer-events-none` overlay layer inside each tile with explicit opacity transitions, so hover darkening always renders.
   - Keep the `+` button opacity-based so nothing shifts.
   - Make hover, today, and drag-over states layer cleanly instead of conflicting.

2. Restore a real scrollable calendar layout
   - Replace the single-month fixed grid with a scroll container that renders month sections, using the working pattern already present in `src/components/ideation/IdeationCalendar.tsx`.
   - Wire `onRequestMonths` back in so visible months actually fetch data.
   - Keep sticky weekday headers and month labels inside the scroll area.

3. Make it fill the full available height
   - Tighten the wrapper sizing in `TaskCalendarView` and `TaskWindow` so the full parent chain uses `h-full min-h-0 overflow-hidden`.
   - Remove the “content decides height” behavior that leaves dead space under the month.
   - Ensure the scroll area owns the remaining height of the task panel.

4. Keep navigation coherent
   - Use `currentMonth` to scroll to the selected month when Prev / Next / Today is clicked.
   - If needed, sync the visible month back to the top label while scrolling so the label stays accurate.

Validation
- Hover any day tile: it must visibly darken, including tiles with events and pills.
- Hover must not move the day number or `+` button.
- Calendar must occupy the full task panel in both Split and Campaigns-only modes.
- Calendar must vertically scroll through months instead of stopping at a half-height single month.

Technical details
- Primary files: `src/components/ideation/TaskCalendarView.tsx`, `src/components/ideation/TaskWindow.tsx`
- Likely reuse/reference: `src/components/ideation/IdeationCalendar.tsx`
- No fake fallbacks: the fix will use valid, explicit styling and real scroll behavior.
