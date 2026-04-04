

## Figma-Style Text Hover Underline + Click-Outside Deselection

### 1. Solid blue underline on text hover (like Figma)

The uploaded screenshot shows Figma applies a **solid blue underline** to text passages on hover — not a dashed border around a bounding box. 

**Change**: Update the `.el-hover` CSS in the injected iframe styles and the `hoverHighlight` handler:

- Replace the current `outline: 1px dashed rgba(59,130,246,0.7)` with `text-decoration: underline; text-decoration-color: rgba(59,130,246,0.8); text-underline-offset: 2px;` for text elements (H1-H6, P, SPAN, A, LI, LABEL, BUTTON)
- For non-text elements (IMG, TD, DIV), keep a subtle blue outline since underline doesn't make sense
- Split `.el-hover` into `.el-hover-text` (underline) and `.el-hover-block` (outline), applied based on element type in the `hoverHighlight` message handler

### 2. Click anywhere outside campaign frame deselects everything

Currently, clicking the grey area outside the iframe **does** trigger deselection — but only when the click is on the preview panel itself (not the IFRAME tag). Two gaps exist:

**a) Clicks on the sidebar/chat panel don't deselect.** Add a `pointerdown` listener on the parent document that fires `clearSelection` to the iframe and clears `selectedElementContext` whenever the click target is outside the preview panel.

**b) Clicking outside while actively editing text inside the iframe doesn't exit edit mode.** Add a `blur` trigger: when the parent detects a click outside the iframe, send a new `exitEditMode` message to the iframe that blurs any `contentEditable` focus and clears selection.

### Files changed
- `src/pages/CampaignEditor.tsx` — hover CSS update, hoverHighlight handler split, document-level click-outside listener

