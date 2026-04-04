

## Adopt Figma-Style Interaction State Machine

### Context

The current editor uses separate `onMouseDown`/`onMouseMove`/`onMouseUp` handlers with ad-hoc state (`dragSelect` object, `selectedElementContext`, etc.). The iframe handles its own click-to-select logic independently. This creates edge cases: accidental drags on click, no hover highlighting, and disconnected interaction flows.

The Figma-style state machine can be adopted **without touching any AI backend code**. All changes are in the interaction layer — the same `CampaignEditor.tsx` file and the injected iframe script.

### What changes

**1. Add an interaction state machine to the parent component**

Replace the current `dragSelect` state and scattered mouse handlers with a single `interactionState` ref that tracks: `IDLE`, `PRESSED`, `DRAGGING` (element move — future), and `MARQUEE` (drag-to-select).

- `IDLE`: hover → send `hoverHighlight` message to iframe for subtle outline on element under cursor. Click detection deferred until `pointerup`.
- `PRESSED`: pointer is down, target recorded. If movement exceeds 4px threshold → transition to `MARQUEE` (or `DRAGGING` in future). If released without exceeding → it was a click, forward to iframe as selection.
- `MARQUEE`: the current drag-select behavior, but driven by the state machine. Live preview highlighting continues as-is. On release → finalize selection, return to `IDLE`.

Use `pointerdown`/`pointermove`/`pointerup` instead of mouse events, and call `setPointerCapture()` to prevent stuck-drag bugs when the cursor leaves the editor area.

**2. Add hover highlighting inside the iframe**

New message type `hoverHighlight` sent from parent during `IDLE` state. The iframe script applies a subtle `outline: 1px solid rgba(200,241,53,0.3)` on the element under the cursor (`.el-hover` class). Hover highlight is suppressed when:
- The element is already `.el-selected`
- The state is not `IDLE` (no hover during drag/marquee)

**3. Add `e.preventDefault()` on pointerdown + `user-select: none` during drag**

This is already partially done but will be consolidated. During `MARQUEE` and `DRAGGING` states, `document.body.style.userSelect = 'none'` is set and restored on completion.

**4. Escape key deselects all**

Forward `clearSelection` to iframe on Escape press (partially exists, will be consolidated into the keyboard handler).

### What stays the same

- All iframe-internal logic (text editing, contentEditable, floating toolbar, section drag-reorder via SortableJS, image swap, delete button, syncHtml)
- All AI backend communication (generate-campaign, edit-campaign, etc.)
- The postMessage protocol between parent and iframe
- The visual styling (green accent color, dark theme)

### Technical approach

All changes in `src/pages/CampaignEditor.tsx`:

**Parent side:**
- Replace `dragSelect` state with `interactionStateRef = useRef<InteractionState>({ type: 'IDLE' })` (ref to avoid re-render on every pointermove)
- Replace `onMouseDown`/`onMouseMove`/`onMouseUp` on the preview panel with `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`
- Add `setPointerCapture` in pointerdown, `releasePointerCapture` in pointerup
- Throttle pointermove with `requestAnimationFrame` during MARQUEE to avoid excessive postMessage calls
- Keep a small `forceUpdate` counter state to trigger re-render only for the marquee overlay rectangle

**Iframe side:**
- Add `.el-hover` CSS class (thin subtle outline, different from `.el-selected`)
- Handle new `hoverHighlight` message: apply/remove `.el-hover` on the element at the given coordinates using `document.elementFromPoint()`
- Handle new `hoverClear` message: remove all `.el-hover`

### Scope boundaries

This plan does **not** include drag-to-reorder elements (the `DRAGGING` state for moving blocks). That's a larger feature that can be layered on top of this state machine later. This plan focuses on making click, marquee-select, hover, and deselect feel Figma-smooth.

