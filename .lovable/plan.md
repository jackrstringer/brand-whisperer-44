

## Plan: Element Selection with Chat Context & Visual Controls

### What this adds
1. **Click-to-select any element** in the preview — shows a persistent selection outline (not just text elements). Clicking a different element changes selection; clicking empty space deselects.
2. **Selection context feeds into chat** — when an element is selected and the user types in chat, the message automatically includes the element's context (tag, text, outerHTML) so the AI knows what to edit.
3. **Background color control** — the floating toolbar gains a background-color swatch (in addition to the existing text color swatch), using the same panel UI.
4. **Frame alignment controls** — padding and margin quick-adjust buttons on the toolbar for the selected element.
5. **Drag-to-select region** — hold Shift + click-drag to draw a rectangle; all elements within get grouped as a "region" selection that feeds into chat context.

### Technical approach

**File: `src/pages/CampaignEditor.tsx`**

#### 1. Element selection state (parent React side)
- Add `selectedElementContext` state: `{ tagName, text, outerHTML, boundingRect } | null`
- Listen for new postMessage type `elementSelected` from iframe
- Listen for `elementDeselected` to clear
- When user sends a chat message and `selectedElementContext` is set, prepend context to the prompt sent to the backend: `"[Targeting <H2> element: \"Shop Now\"]\n\n" + userMsg`
- Show a small indicator chip above the chat input: `"Targeting: <H2> Shop Now..."` with an X to clear

#### 2. Iframe script additions (inside the injected `<script>`)

**Click-to-select (single element):**
- On `click` of any element (not just contenteditable), if not already editing text, set a `selectedEl` variable
- Apply a visual outline: `2px solid rgba(200,241,53,0.6)` with `outline-offset: 2px`
- Post `elementSelected` message to parent with `{ tagName, text, outerHTML, computedStyles }`
- Click on empty space or `Escape` → clear selection, post `elementDeselected`
- Selected element gets the floating toolbar (extended with bg-color + alignment)

**Floating toolbar extensions:**
- Add a second swatch for background-color (reuses `showColorPanel` with a mode param)
- Add padding +/- buttons (adjust `padding` in 4px increments)
- These controls work on any selected element, not just contenteditable text

**Drag-to-select region (Shift+drag):**
- On `mousedown` with Shift held, start tracking a selection rectangle
- Draw a semi-transparent overlay rectangle as the user drags
- On `mouseup`, find all elements whose bounding rect intersects the selection
- Post `regionSelected` message with array of `{ tagName, text, outerHTML }` for all captured elements
- Parent stores this as `selectedElementContext` with a combined description

#### 3. CSS additions (in the injected styles)
```css
.el-selected {
  outline: 2px solid rgba(200,241,53,0.6);
  outline-offset: 2px;
}
.region-select-overlay {
  position: fixed;
  border: 1.5px dashed rgba(200,241,53,0.5);
  background: rgba(200,241,53,0.05);
  pointer-events: none;
  z-index: 99997;
}
```

#### 4. Chat input context chip
- Render a small chip above the textarea when `selectedElementContext` is set
- Shows tag + truncated text: `"H2: Shop the Collection..."` with X to dismiss
- Styled with the lime/indigo theme to match the Ideate pill

### Changes summary

| File | What changes |
|------|-------------|
| `src/pages/CampaignEditor.tsx` | Add `selectedElementContext` state, message listeners for `elementSelected`/`elementDeselected`/`regionSelected`, context injection in `sendMessage`, context chip UI above chat input, extend injected iframe script with click-to-select, bg-color swatch, padding controls, and shift-drag region select |

### Not included (future)
- Margin controls (just padding for now to keep scope tight)
- Multi-element toolbar actions beyond chat context

