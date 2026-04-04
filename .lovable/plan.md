

## Figma-Style Hover Highlighting + Instant Undo/Redo

### 1. Figma-style hover highlight (dashed blue border)

The current hover style is a solid green outline: `outline: 1px solid rgba(200,241,53,0.3)`. The user's screenshots show Figma uses a **blue dashed border** on hover.

**Change in the injected CSS** (~line 1497 in `CampaignEditor.tsx`):

Replace the `.el-hover` style:
- From: `outline:1px solid rgba(200,241,53,0.3)!important;outline-offset:1px;`
- To: `outline:1px dashed rgba(59,130,246,0.7)!important;outline-offset:0px;` (blue dashed, tighter fit)

And the `.el-hover.el-selected` combo style:
- From: `outline:2px solid rgba(200,241,53,0.6)!important;outline-offset:2px;`
- To: `outline:2px solid rgba(59,130,246,0.8)!important;outline-offset:1px;` (solid blue when both hovered+selected, like Figma)

The selection highlight (`.el-selected`) stays green to differentiate click-selected from hover.

### 2. Instant undo/redo (remove all latency sources)

Current undo/redo is already "optimistic" (updates local state first, then persists to database). Two remaining lag sources:

**a) Remove `toast.success()` calls from undo/redo** (~lines 1126, 1141). Toast notifications create visual overhead and a perceived delay. Figma doesn't show toasts on undo/redo.

**b) Fire-and-forget the database update.** The current code `await`s the Supabase update. Change to fire-and-forget (no `await`) since the optimistic state is already applied. If the DB write fails silently, the next save will catch up.

**c) Remove the `iframeOwnedHtmlRef.current = null` reset in handleUndo** that can cause a brief flash. Instead, after setting the campaign state, immediately post the new HTML to the iframe so the preview updates in the same frame.

**d) Post the restored HTML directly to the iframe** via `postMessage({ type: 'loadHtml', html })` right after the optimistic state update, so the iframe doesn't wait for a React re-render cycle to pick up the new `srcdocHtml`.

### Files changed
- `src/pages/CampaignEditor.tsx` — CSS tweaks for hover style, streamlined undo/redo handlers

