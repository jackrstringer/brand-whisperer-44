

## Root cause

1. **Canvas blank**: `CanvasContent` uses `min-h-full w-full` inside `react-zoom-pan-pinch`'s `TransformComponent` with `contentStyle={{ width: "100%", height: "100%" }}`. zoom-pan-pinch needs content with **intrinsic dimensions** — when content is `100%` it collapses + transforms move it offscreen. Session replay confirms transforms firing but viewport is empty.
2. **Chat is still verbose**: `ProgressStages` ("Building your flow", multi-line stage list) renders every time. User wants Claude-Code style: a single inline shimmering status line.
3. **Skeleton IS in the DB** (verified — 4188 chars, well-formed `[TRIGGER]/[FILTERS]/[EXIT]/[EMAIL]` blocks) so parser works; pure rendering bug.

## Plan

### 1. Fix the Miro canvas (`SkeletonViewer.tsx`)
- Remove `width/height: 100%` from `TransformComponent`'s `contentStyle`. Give the inner canvas **intrinsic size** (e.g. `min-w-[640px] py-20 px-12`) so zoom-pan-pinch can pan/zoom around real content.
- Set `TransformWrapper` `centerOnInit centerZoomedOut initialScale={0.9} minScale={0.3} maxScale={2}` and `limitToBounds={false}`.
- Wrap the content in a fixed-width column (`w-[520px] mx-auto`) so cards stay aligned regardless of pan.
- Add subtle dot-grid as a CSS background on the outer viewport (not inside transform) so the grid stays put during pan — gives the real "Miro" feel.
- Add a fit-to-content on first mount via `resetTransform()` after layout.

### 2. Claude-Code-style loading (`FlowAgentChat.tsx`)
- Replace `ProgressStages` card with a **single inline shimmer line**: an animated dot + the current stage label (`Reading research…` → `Designing strategy…` → `Drafting skeleton…`). No box, no checklist.
- Suppress the "Drafting skeleton on the canvas →" pill (the canvas already shows drafting state).
- While `currentSkeleton` exists, never show stage indicators again — chat becomes a clean conversational thread.

### 3. Pre-skeleton vs post-skeleton chat layout
- Pre-skeleton: chat centered, single-line shimmer, single Q&A bubble at a time. No raw JSON ever shown.
- Post-skeleton: chat = right rail only (already correct). Confirm `visibleMessages` filter strips ALL control-fence-only messages so we never see naked JSON.

### 4. Live skeleton drafting on canvas
- Already wired via realtime `flows` row updates. Verify the `SkeletonViewer` `drafting` shimmer shows when `flow.status === "draft" || "generating"` and `nodes.length === 0`. Keep that, just visually upgrade the shimmer to match the Miro aesthetic (ghost cards on the dot grid).

### 5. Approve & Generate All → node fill-in
- Already wired (each node renders generation status + preview when complete). No changes needed beyond ensuring expanded node shows the campaign HTML cleanly.

### Files touched
- `src/components/flows/SkeletonViewer.tsx` (canvas sizing + transform config + grid-on-viewport)
- `src/components/flows/FlowAgentChat.tsx` (replace stage card with inline shimmer; drop "drafting on canvas" pill)

### Verification
- After deploy: load `/brands/.../flows/<id>` for the existing skeleton-ready flow. Confirm trigger → filters → email cards render visibly, scrollable/pannable/zoomable. Confirm new flow shows single shimmer line in chat, not the stage checklist.

