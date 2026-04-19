
Goal: redesign the flow builder so the whole experience matches the uploaded Flowline mockup and not just “make the old UI visible”.

What’s wrong now
- The current page is still an app-style split layout: top bar + fixed right chat rail + dark tokens + stacked cards.
- The mockup is a canvas-first experience: warm light board, floating chrome, centered diagram, minimal composer, and almost invisible app scaffolding.
- So this is not a small canvas bug anymore; it needs a layout/system redesign across the page shell, canvas renderer, and chat surface.

Implementation plan

1. Rebuild the page shell around the canvas
- Replace the current `FlowBuilderPage` desktop layout with a single full-screen canvas stage.
- Move header controls into floating overlays that match the mockup:
  - top-left: back + title + small status breadcrumb
  - top-right: large floating “Approve & Generate All” pill
  - bottom/right or bottom/center: floating chat composer / conversation panel
- Remove the hard visual split caused by the fixed 400px right rail.

2. Redesign `SkeletonViewer` to match the mockup feel
- Switch from the current dark dotted workspace to a warm light canvas with subtle depth.
- Rework node composition from stacked “app cards” into cleaner board nodes with:
  - thinner outlines
  - larger corner radius
  - lighter shadows
  - more diagram-like spacing
- Add proper diagram layout behavior so trigger / branches / emails feel centered and intentional instead of a vertical list.
- Keep zoom/pan, but hide the tooling visually unless needed and make the default framing land on the full skeleton.

3. Make the skeleton board feel conversational and alive
- While drafting, show ghost nodes appearing directly on the board instead of generic loading cards.
- Preserve realtime skeleton updates, but render them as a live drafting state on-canvas.
- When messages are generated, surface status and preview directly inside the nodes in a cleaner board style.

4. Replace the current chat UI with Flowline-style interaction
- Rebuild `FlowAgentChat` so it feels like a lightweight floating assistant, not a sidebar transcript.
- Use a minimal Claude-like loading line only during active thinking.
- Keep technical/control messages fully hidden.
- For existing flows with a ready skeleton, show only relevant conversational edits and suppress legacy scaffolding/setup history.

5. Align styling with the uploaded mockup exactly
- Introduce a dedicated visual mode for flows:
  - warm off-white background
  - charcoal floating buttons
  - soft gray borders
  - sparse, premium typography
  - larger whitespace and calmer contrast
- This should override the current default dark/product UI patterns just for the flow builder.

6. Preserve current functionality while changing presentation
- Keep current skeleton parsing, realtime updates, node editing, per-node generation, and bulk generation logic.
- Only remap these behaviors into the new canvas-first UI so existing flows still work.
- Ensure current flows render immediately without needing regeneration.

Files to update
- `src/pages/FlowBuilderPage.tsx` — replace split-shell layout with floating canvas-first shell
- `src/components/flows/SkeletonViewer.tsx` — redesign board, node styling, framing, drafting state
- `src/components/flows/FlowAgentChat.tsx` — convert to minimal floating conversational UI and hide legacy setup output
- `src/components/AppLayout.tsx` — only if the flow route still needs shell adjustments for true edge-to-edge rendering

Verification
- Existing skeleton-ready flows should immediately render a visible centered board.
- The page should visually resemble the uploaded mockup in layout, spacing, contrast, and control placement.
- Re-entering a flow should not re-show fake setup/loading states.
- Editing via chat should feel conversational and update the skeleton on the board.
- Generated emails should be viewable directly inside their nodes.
