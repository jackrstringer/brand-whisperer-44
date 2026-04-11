

## Plan: Ideation Page Overhaul — Resizable Panels, Task Window, View Modes

### Summary
Restructure the Ideation page into a flexible two-panel layout with resizable divider, replace the separate Design Queue + Calendar with a unified "Task Window" (Airtable/ClickUp-style list view + calendar view), and add layout mode toggling (split vs single window).

### What Changes

**1. Remove top header bar entirely**
- Delete the header containing back button, "Ideate" label, and panel toggle from `IdeatePage.tsx`
- The sidebar already provides navigation; no dedicated header needed

**2. Add "Clear Chat" button to ChatBar**
- Small icon button (Trash2 or RotateCcw) in the ChatBar bottom row
- New `onClearChat` prop on ChatBar, wired to a reset function in IdeatePage

**3. Menu (CampaignTypePicker) shows by default on new sessions**
- When `hasStarted` is false, show the full CampaignTypePicker inline (already does this)
- Remove the "Menu" toggle button from ChatBar bottom row — the picker is always visible when there are no nodes, and accessible via the existing compact pill bar after generation starts
- Keep the Menu button for re-opening the full picker mid-session (overlay above ChatBar)

**4. Resizable panel divider (drag to resize)**
- Use the existing `react-resizable-panels` library (already in `src/components/ui/resizable.tsx`)
- Replace the current CSS-based 50/50 split with `<ResizablePanelGroup>` + `<ResizablePanel>` + `<ResizableHandle>`
- Left panel: ideation flow (default 50%, min 30%)
- Right panel: task window (default 50%, min 25%)
- Everything fills available space responsively

**5. Unified Task Window (replaces separate Queue + Calendar)**

Create a new component `src/components/ideation/TaskWindow.tsx`:

- **View toggle**: Two small icon buttons at top — List view (default) and Calendar view
- **Star button** next to each view icon: clicking stars a view to make it the default (persisted in localStorage)
- **List View** (Airtable-style table):
  - Columns: Status (color dot), Title, Campaign Type, Send Date, Actions
  - Sortable rows via drag handles
  - Status shown as colored badge (queued/configured/generating/generated/sent)
  - Click row → opens Task Detail panel
  - Bulk Generate button in header
  - Drop target for dragging ideas from left panel
- **Calendar View**: 
  - Reuse existing `IdeationCalendar` component but embedded within the Task Window
  - Click a pill → opens Task Detail panel

**6. Task Detail Panel (replaces GenerationDrawer)**

Create `src/components/ideation/TaskDetail.tsx`:

- Renders **inline within the right panel** (not a full-screen drawer/overlay)
- Shows all fields from current GenerationDrawer: title, brief, subject line, copy direction, design notes, send date
- Status displayed prominently as a badge — clicking cycles through statuses or opens a dropdown
- "Generate Email" button feels like a status transition: queued → generating → generated
- Progress indicator during generation
- If campaign is generated (`status === 'generated'` and `campaign_id` exists): render the campaign preview at the bottom (iframe or fetch campaign HTML)
- Back button to return to list/calendar view
- Auto-saves on field changes (debounced, same as current GenerationDrawer)

**7. Layout mode toggle (split vs single window)**

Two small icons in the top-right area of the page (above the panels):
- **Split view** (default): Ideation left, Task Window right — the current resizable split
- **Single view**: One full-width panel. Small tab bar at top to switch between "Ideation" and "Tasks"
- Persisted in localStorage

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/ideation/TaskWindow.tsx` | Unified list/calendar container with view toggle |
| `src/components/ideation/TaskDetail.tsx` | Inline task detail panel (replaces GenerationDrawer as overlay) |
| `src/components/ideation/TaskListView.tsx` | Airtable-style list table for queue items |
| `src/components/ideation/TaskCalendarView.tsx` | Calendar view wrapper (reuses IdeationCalendar internals) |

### Files to Modify
| File | Change |
|------|--------|
| `src/pages/IdeatePage.tsx` | Remove header bar, use ResizablePanelGroup for split, add layout mode toggle (split/single), wire TaskWindow + TaskDetail, remove separate DesignQueue + IdeationCalendar usage |
| `src/components/ideation/ChatBar.tsx` | Remove "Menu" button from bottom row, add "Clear chat" icon button, add `onClearChat` prop |
| `src/components/ideation/IdeationCalendar.tsx` | Minor — may need prop adjustments for embedding in TaskCalendarView |

### Files Unchanged
- All hooks (`useIdeation`, `useDesignQueue`, `useIdeationCalendar`)
- All backend/edge functions
- `campaignTypes.ts`, `streamHelpers.ts`, `bulkGenerate.ts`, `seedCalendar.ts`
- `GenerationDrawer.tsx` (kept for reference but no longer rendered from IdeatePage — TaskDetail replaces it)

### Technical Details

**Resizable panels** use the existing `react-resizable-panels` already installed:
```tsx
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={50} minSize={30}>
    {/* Ideation flow */}
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={50} minSize={25}>
    {/* Task Window */}
  </ResizablePanel>
</ResizablePanelGroup>
```

**View preference persistence**: `localStorage.setItem('ideation-default-view', 'list' | 'calendar')` and `localStorage.setItem('ideation-layout', 'split' | 'single')`.

**Task Detail inline rendering**: When a task is selected, the TaskWindow component replaces its list/calendar content with TaskDetail. A back arrow returns to the previous view. No overlay/backdrop — it's a panel navigation, not a modal.

**Campaign preview in TaskDetail**: When `campaign_id` exists and status is `generated`, fetch the campaign's `final_html` from the `campaigns` table and render in a sandboxed iframe at the bottom of the detail panel.

