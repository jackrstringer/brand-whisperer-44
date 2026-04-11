

## Plan: Align Ideation UI with Spec

Based on the detailed spec you provided, here are the gaps between the current implementation and the intended behavior. This plan fixes them without touching any hooks, edge functions, or backend code.

### Issues Found

1. **TurboIdeaTable uses dark-theme classes** — all `text-white/40`, `bg-white/[0.03]`, `border-white/[0.06]` references need to become theme-aware (`text-muted-foreground`, `bg-muted`, `border-border`).

2. **Normal mode IdeaGrid missing columns** — spec says Normal mode shows: Checkbox | Type | Title | Description (hidden `<md`) | Subject Line (hidden `<lg`). Current implementation only has Checkbox | Type | Title | Actions.

3. **AI Response nodes never rendered** — `NodeFlow` returns `null` for `ai_response` nodes, so Lucy's commentary is generated and saved but invisible. These should render as left-aligned chat bubbles.

4. **Streaming token handling** — `onIdeaField` currently replaces the field value (`ideas[index][field] = value`) instead of appending (`ideas[index][field] += token`). This means only the last token shows, not accumulated text.

5. **Auto-scroll reset logic** — current code resets `hasAutoScrolledRef` when node count *decreases*, but per spec it should reset when `isGenerating` becomes true (i.e., a new generation round starts).

6. **Normal mode streaming cursor** — spec calls for `animate-lucy-blink` on the cursor after streaming title text. Current code uses generic `animate-pulse`.

7. **Turbo skeleton styling** — ghost checkboxes and placeholder bars should use theme colors, not hardcoded white-alpha values.

### Files Modified

- **`src/components/ideation/TurboIdeaTable.tsx`** — Replace all dark-theme color classes with light-theme equivalents (`border-border`, `text-muted-foreground`, `bg-muted`, etc.). Fix ghost skeleton styling.

- **`src/components/ideation/IdeaGrid.tsx`** — Add Description column (hidden `<md`) and Subject Line column (hidden `<lg`). Update streaming cursor to use `animate-lucy-blink`. Add skeleton rows that match the new column count.

- **`src/components/ideation/NodeFlow.tsx`** — Render `ai_response` nodes as a left-aligned chat bubble (similar to BriefNode but left-justified) showing Lucy's commentary. Fix auto-scroll reset: trigger on `isGenerating` going true, not on node count decrease.

- **`src/hooks/useIdeation.ts`** — Fix `onIdeaField` to append tokens instead of replace: change `ideas[index][field] = value` to `ideas[index][field] = (ideas[index][field] || '') + value`.

- **`src/index.css`** (or `tailwind.config.ts`) — Add `animate-lucy-blink` keyframes if not already present: `opacity 1→0→1, 1s ease-in-out infinite`.

### What Does NOT Change
- No hooks logic changes (only the token append fix in useIdeation)
- No edge functions or backend
- No campaignTypes.ts
- No GenerationDrawer, streamHelpers, bulkGenerate, seedCalendar
- All features (drag-and-drop, turbo, chaos, streaming, bulk generate, queue, calendar) remain fully functional

