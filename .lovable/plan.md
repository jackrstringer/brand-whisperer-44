

## Goal

Replace the current vertical skeleton-list flow builder with a Miro-style infinite canvas flow builder powered by React Flow, wired to the existing backend (flows, flow_emails, edit-campaign, generate-campaign, Klaviyo trigger config). UI follows the spec; backend reuses what already works.

## Architecture

```text
FlowBuilderPage (canvas route, full-width)
├── TopBar (flow name, status, analytics toggle, save, undo/redo)
├── StrategySummaryPanel (collapsible TOC, click-to-scroll)
├── LeftSidebar (node palette ↔ node config, contextual)
├── ReactFlow Canvas (dark, dotted grid, minimap, viewport ctrls)
│   ├── Custom nodes: Trigger, TimeDelay, Email, SMS, Push,
│   │   ConditionalSplit, TriggerSplit, UpdateProperty,
│   │   ListUpdate, Webhook, InternalAlert, CustomAction
│   └── Custom edges with hover "+" insertion + YES/NO labels
├── MessageDetailFlyout (right-slide, tabs: Preview/Content/
│   Analytics/Activity/Notes) — reuses CampaignEditor preview
└── AIChatPanel (right strip, expand to 420px)
    └── Routes to flow-agent for plan, edit-campaign for edits
```

## Backend wiring (reuses existing system)

- `flows` table: add `canvas_state jsonb` (node positions, viewport, edges) and `trigger_config jsonb` (metric/list/segment + filters + flow frequency + smart sending). Keep `skeleton_markdown` for AI plan import.
- `flow_emails` table: add `node_type` values for `delay`, `conditional_split`, `trigger_split`, `update_property`, `list_update`, `webhook`, `internal_alert`, `custom_action`, `sms`, `push`. Add `canvas_position jsonb` and `node_config jsonb` for type-specific data (delay duration, split conditions, etc.).
- New table `flow_edges` (id, flow_id, source_node_id, target_node_id, source_handle, label) so split branches and arbitrary topology work — current schema assumes linear sequence_index.
- New table `flow_node_comments` for the Notes tab (mirrors campaign chat_messages shape).
- `flow-agent` edge function: extend to emit canvas-aware ops (add_node, remove_node, connect, set_config) instead of only skeleton markdown. Existing skeleton parser becomes the import path for legacy flows.
- `generate-campaign`: unchanged. Each Email/SMS node fires it with the existing flowConfig payload (trigger_metric_name, step_number, total_steps, step_goal). Polling architecture stays as-is.
- Klaviyo trigger picker: reuse `klaviyo-fetch-schema` for metrics list and add a list/segment fetch path. If no Klaviyo connection, show the "Connect Klaviyo" empty state already used elsewhere.

## Frontend work

New files:
- `src/pages/FlowBuilderCanvas.tsx` — replaces current `FlowBuilderPage.tsx` content
- `src/components/flowbuilder/Canvas.tsx` — React Flow wrapper, viewport, minimap, grid
- `src/components/flowbuilder/nodes/*` — one file per node type, all sharing `BaseNodeCard`
- `src/components/flowbuilder/edges/InsertableEdge.tsx` — hover "+" + YES/NO labels
- `src/components/flowbuilder/TopBar.tsx`
- `src/components/flowbuilder/StrategyPanel.tsx`
- `src/components/flowbuilder/LeftSidebar.tsx` (palette + config router)
- `src/components/flowbuilder/configs/*` — per-node config panels
- `src/components/flowbuilder/MessageFlyout.tsx` — uses existing email preview iframe
- `src/components/flowbuilder/ChatPanel.tsx` — replaces FlowAgentChat, talks to extended flow-agent
- `src/components/flowbuilder/QuickAddMenu.tsx` — floating add menu for "+" / double-click
- `src/hooks/useFlowCanvas.ts` — load/save canvas_state, undo/redo stack, autosave debounce
- `src/hooks/useFlowAgentActions.ts` — applies AI ops to canvas with diff preview

Reused as-is:
- `edit-campaign`, `generate-campaign`, `visual-qa`, `klaviyo-render-preview`
- `CampaignEditor` preview iframe inside the flyout's Preview tab
- Existing dark theme tokens; design system already matches the spec's palette intent

`AppLayout.tsx`: confirm `/flows/` is in `FULL_WIDTH_ROUTES` (it already is).

## Behavior rules (matching spec)

- Canvas: dot grid, snap to 20px, zoom 10–200%, minimap bottom-right, viewport pill bottom-left.
- Selection: single click select, shift+click multi, drag-rect on empty canvas, Cmd+A/D/C/V, Delete with confirm for message nodes that have generated HTML.
- Edge insertion: hover edge → "+" at midpoint → QuickAddMenu → atomic delete-edge / create-node / create-two-edges.
- Conditional/Trigger splits: two output handles (`yes`, `no`), labeled edges, live counts come from `flow_emails.recipients` once Klaviyo data is wired.
- Email node thumbnail: render existing `flow_emails.html` to a 60x80 thumbnail via `klaviyo-render-preview` cache (already used for previews).
- Analytics toggle: top-bar switch flips `showAnalytics` state; metric bars expand with Framer Motion layout animation.
- Strategy panel TOC: derived from current nodes/edges, click → `reactFlowInstance.setCenter(node.position)`.
- Chat panel: collapsed 48px strip default; expanded 420px; routes user message to `flow-agent` which returns either text-only reply or an ops array; ops apply with diff preview + `Apply / Modify / Cancel`; Undo All restores prior canvas snapshot.
- Trigger setup on flow creation: welcome flows → list dropdown, others → metric dropdown; if no Klaviyo connection, inline "Connect Klaviyo" message (no silent failure, per project rule).
- Failure handling: per the no-graceful-fallback rule, AI op apply errors surface the actual error and the failing op; generation failures already use the existing polling + last_error path.

## Migration path

- Existing flows with `skeleton_markdown` and linear `flow_emails` auto-import on first canvas load: parser places nodes in a vertical column at x=0, y=index*200, and creates `flow_edges` rows linking them in order.
- `canvas_state` saved on every change (debounced 500ms) so the layout becomes the source of truth going forward.

## Out of scope for v1

- A/B test wrapper container (spec section 3.14)
- Push notification node beyond stub
- Webhook / Custom Action runtime (UI + storage only, no execution)
- Comments @mentions and attachments
- Pop-out floating chat window
- Mobile/tablet support (desktop-only, ≥1024px, per spec)

## Phasing

1. Schema migration (canvas_state, trigger_config, flow_edges, node_config, flow_node_comments) + legacy import.
2. Canvas + Trigger / TimeDelay / Email / ConditionalSplit nodes + edge insertion + autosave.
3. TopBar, StrategyPanel, LeftSidebar (palette + config), MessageFlyout (Preview + Content + Analytics tabs).
4. Remaining node types (SMS, Push, TriggerSplit, UpdateProperty, ListUpdate, Webhook, InternalAlert, CustomAction).
5. ChatPanel + extended flow-agent ops + diff preview + undo.
6. Analytics overlay + Notes tab + keyboard shortcuts + minimap polish.

