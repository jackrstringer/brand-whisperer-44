

## Revised Plan: Click-Outside Deselection

### Clarification

You want clicking **anywhere** that isn't inside the campaign iframe to deselect — whether that's the grey area, the sidebar, the chat panel, or anywhere else on the page. That's exactly what the document-level listener (lines 1435-1452) already does.

### What to do

**Keep the existing code as-is.** The previous plan proposed removing the document-level `handleOutsideClick` listener — that was wrong. The current implementation already:

- Listens for `pointerdown` on the entire document
- Checks if the click is inside the preview panel — if not, fires `clearSelection` + `exitEditMode` to the iframe and clears `selectedElementContext`
- The grey-area handler (line 3035) catches clicks inside the preview panel but outside the iframe

Together these two handlers cover every "not inside the campaign" scenario. **No code changes needed** — just don't proceed with the removal that was previously planned.

### Also add: `exitEditMode` to the grey-area handler

One small addition: the grey-area click handler (line 3035-3040) currently sends `clearSelection` but not `exitEditMode`. Add `exitEditMode` there too for consistency, so clicking the grey area also exits text editing mode.

### Files changed
- `src/pages/CampaignEditor.tsx` — add one `exitEditMode` postMessage to the grey-area click handler (~line 3038)

