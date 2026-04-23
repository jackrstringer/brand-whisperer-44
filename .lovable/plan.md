## Plan

I’ll fix this as one complete pass, not as partial tweaks.

### What will change

1. **Restore the correct workspace structure**
   - Convert the post-skeleton flow screen into a two-pane layout:
     - **Left:** flow canvas
     - **Right:** AI chat panel
   - Keep the centered onboarding chat only for the pre-skeleton state.
   - Remove the bottom-centered dock behavior after a skeleton exists.

2. **Make the summary bar expand upward while the clicked bar stays fixed**
   - Rebuild the flow summary so the **collapsed header remains at the exact same screen position**.
   - Render the expanded content **above** that header instead of below it.
   - Prevent overlap with nearby canvas elements.
   - Add a clear hover state and selected/open state for the summary area.

3. **Fix interaction semantics: click, select, open, drag**
   - Separate **click-to-select/open** from **drag-to-move** using a drag threshold so clicks stop being swallowed by immediate drag behavior.
   - Make every node visibly respond to:
     - default
     - hover
     - selected
     - active/pressed
   - Add matching hover states for all other interactive surfaces: summary bar, delay nodes, split nodes, info regions, rail items, zoom controls, cleanup button, preview cards, and sticky notes.
   - Ensure selected state persists until another item is selected or deselected.

4. **Restore “open” behavior everywhere it should exist**
   - Make message nodes consistently open their preview/details when clicked.
   - Add explicit open/detail behavior for non-email nodes where relevant instead of dead clicks.
   - Ensure click targets are not blocked by overlays or pointer-event mistakes.

5. **Implement deletion for everything**
   - Add delete support for any selectable canvas item.
   - Support keyboard delete/backspace plus visible delete affordances.
   - For normal linear nodes: remove node and rewire the path cleanly.
   - For split nodes: show a confirmation dialog with branch-aware options:
     - delete YES path
     - delete NO path
     - delete both
     - optionally cancel
   - Keep the graph valid after every delete action and relayout immediately.

6. **Stabilize layout and cleanup behavior**
   - Keep the centered lane behavior already introduced, but make cleanup authoritative:
     - evenly spaced
     - centered from trigger
     - symmetric branches
     - no overlaps
   - Ensure cleanup relayout also resolves any corrupted manual placements or edge/node collisions.

### Technical details

- **`src/pages/FlowBuilderPage.tsx`**
  - Replace the floating post-skeleton chat composition with a persistent split layout using the existing split-pane pattern.
  - Keep top-left and top-right page chrome above the workspace.

- **`src/components/flows/FlowAgentChat.tsx`**
  - Add a proper right-panel mode for the flow builder instead of the current bottom dock.
  - Preserve existing conversation/history logic and composer behavior.

- **`src/components/flows/SkeletonViewer.tsx`**
  - Refactor node pointer handling so click/open and drag are distinct.
  - Add robust selection state, delete actions, and branch-aware split deletion.
  - Re-anchor the summary card so the header stays fixed and the body grows upward.
  - Keep deterministic tree layout and improve cleanup relayout.

- **`src/index.css`**
  - Add complete hover/selected/active styling coverage for all interactive canvas elements.
  - Tighten transitions so they feel crisp instead of laggy.
  - Update summary card positioning styles to support upward-only expansion.

- **Dialog support**
  - Reuse the existing alert/dialog components already in the project for destructive delete confirmation flows.

### Verification after implementation

I’ll verify all of these together before calling it done:
- hovering every interactive element shows a clear state
- selected nodes stay visibly selected
- delay/info/split/summary areas are interactive and not dead
- summary header stays fixed while content expands upward
- right side is AI chat, not a bottom-centered dock
- delete works for all selectable items
- split delete asks which branch to remove
- cleanup restores clean spacing with no overlaps
- clicks open correctly and drags only start when intended