## Plan

Rebuild the flow canvas so it behaves like a real email-flow builder instead of a free-placement whiteboard.

### What will change
1. Replace the current hover-plus palette with a permanent left rail showing all node types.
2. Remove the cursor/select mode button entirely.
3. Make node creation path-based only: users drag from the left rail and drop onto a visible path target, branch target, or end-of-flow target.
4. Add explicit insertion zones between nodes and on split branches so drops never land “somewhere on the canvas.”
5. Auto-reflow the graph after every insert/move so nodes cannot overlap and branch spacing stays clean.
6. Keep the trigger summary card, but redesign it to feel more polished and intentional above the trigger.
7. Persist the interactive graph so future generation/editing uses the actual flow structure, not just a visual approximation.

### Why the current version feels wrong
The current flow builder is still using a whiteboard-style placement model:
- the left menu is hover-only and disappears because it is controlled purely by CSS hover state
- dragging from the palette just drops a node at the mouse coordinates via `addNodeAt(...)`
- there are no true path drop targets or branch insertion targets
- collision handling only pushes boxes apart after placement; it does not insert into the flow structure
- the board is derived from linear parsed markdown, so it is not yet a true editable graph

That is why it cannot behave like Klaviyo/Miro-style path editing.

### Implementation steps

#### 1. Replace the current canvas interaction model
- Refactor `src/components/flows/SkeletonViewer.tsx` from “free node placement” to “graph editor.”
- Remove `tool` modes for select/add and delete the cursor button UI.
- Keep pan/zoom, but make normal interaction always selection/drag.
- Convert the left floating toolbar into a permanent node rail with all available node types visible at once.

#### 2. Introduce real drag-and-drop with explicit drop targets
- Use the existing `@dnd-kit/core` dependency already present in the project.
- Wrap the flow builder in a `DndContext`.
- Make each left-rail node type draggable.
- Make each valid insertion point droppable:
  - between sequential nodes
  - below the last node in a path
  - YES branch continuation
  - NO branch continuation
  - empty split branches
- Add strong visual drop indicators so users see exactly where a node will land before release.

#### 3. Replace visual-only layout with graph-aware layout
- Introduce an internal flow graph model in the builder:
  - nodes
  - edges
  - branch metadata
  - ordered path segments
- Stop treating the canvas as arbitrary `x/y` placement.
- Compute positions from graph structure so layout is deterministic.
- After insert/move/delete, re-run layout to:
  - preserve vertical rhythm
  - keep YES/NO branches aligned
  - push downstream nodes automatically
  - prevent overlap by construction instead of by collision patching

#### 4. Make splits behave like real splits
- Treat conditional splits as two real child paths, not one main line plus a fake exit.
- Default each empty branch to a visible “Exit flow” placeholder node.
- Allow dragging directly onto either branch placeholder.
- When a node is dropped on a branch placeholder, replace that placeholder with the new node and continue the branch.

#### 5. Support dragging nodes within the existing flow
- Allow existing nodes to be repositioned structurally by dragging them onto another insertion target.
- Reorder within the same path or move between valid paths where supported.
- Prevent illegal moves that would break trigger/root rules.
- If full reparenting is too risky for first pass, implement safe reorder-within-path and insert-new-node first, then extend to cross-branch moves.

#### 6. Persist the true flow structure
- Move away from using parsed markdown alone as the editor’s source of truth.
- Add a structured graph payload in the backend for each flow, then derive the visual board from that graph.
- Keep current ownership/RLS model intact since flows are already brand-scoped.
- Update save/load so builder changes persist immediately and survive refreshes.
- Keep markdown generation as a derived artifact if needed for prompts, rather than the editing primitive.

#### 7. Update generation to use the structured flow
- Ensure each generated message carries its actual path context and trigger/branch placement forward into generation.
- Use the structured graph to determine:
  - step order
  - branch path
  - preceding node context
  - split conditions
  - trigger context
- Preserve the rule that empty paths default to exit nodes, not invisible dead ends.

#### 8. Polish the UI so it feels intentional
- Redesign the floating summary card above the trigger to expand upward cleanly.
- Improve left rail spacing, labels, hover states, and drag affordances.
- Make drop zones and branch placeholders visually obvious but not noisy.
- Keep the canvas full-width and responsive at the current route’s large desktop viewport.

### Files likely involved
- `src/components/flows/SkeletonViewer.tsx`
- `src/pages/FlowBuilderPage.tsx`
- `src/lib/flows/skeletonParser.ts`
- `src/index.css`
- backend migration(s) for structured flow graph persistence

### Technical details
- Current blocker: `SkeletonViewer` builds a board from `parseSkeleton(...)`, which is linear and not sufficient for true path insertion.
- Recommended source of truth:

```text
flow_graph
├─ nodes[]   (id, type, label, config)
├─ edges[]   (from, to, branch?)
├─ rootId
└─ layout?   optional cached positions/branch lanes
```

- Rendering pipeline:

```text
flow_graph -> layout engine -> positioned nodes/edges -> drop targets -> canvas render
```

- Generation pipeline:

```text
flow_graph -> ordered branch-aware message plan -> generation context per message
```

- Database approach:
  - preferred: add a `flow_graph jsonb` column on `flows`
  - optional: keep per-node config in existing `flow_emails.node_config` / `canvas_position` only if the live schema already has them and they are reliable
  - verify actual schema before implementation, since codegen types show fields not present in the checked migration file

### Delivery order
1. Permanent left rail and removal of hover-plus/select-mode UI
2. DnD insertion targets on paths and split branches
3. Deterministic auto-layout and overlap prevention
4. Structured graph persistence
5. Generation updates to read from structured flow data
6. Visual polish pass

If you approve this plan, I’ll implement the builder as a true path-based graph editor rather than continuing to patch the current whiteboard behavior.