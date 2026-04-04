

## Two Fixes: Redesign Delete Button + Fix Drag-Select Into Campaign

### 1. Redesign the delete button

The current red circle with "✕" is too prominent. Replace it with a subtle, dark pill-style button that matches the editor's dark theme:

- Small dark rounded button (e.g. `background: rgba(0,0,0,0.7); backdrop-filter: blur(6px)`) with a thin border
- Use a minimal trash-can SVG icon instead of the text "✕"
- Appears on hover/selection at the top-right, slightly smaller (18×18px)
- Fades in with a short transition instead of popping in

**File**: `src/pages/CampaignEditor.tsx`
- Update the `.el-delete-btn` CSS class in the injected `<style>` block
- Replace `innerHTML = '✕'` with a small inline SVG trash icon

### 2. Fix drag-select not crossing into the iframe

**Problem**: When dragging starts outside the iframe and enters it, the iframe captures all mouse events, so the parent's `onMouseMove`/`onMouseUp` never fire.

**Fix**: When a drag-select becomes active (`dragSelect.active === true`), set `pointer-events: none` on the iframe element. This makes the iframe transparent to mouse events, allowing the parent panel to track the drag rectangle across the entire area including over the campaign preview. Remove `pointer-events: none` when drag ends (mouseUp/mouseLeave).

**File**: `src/pages/CampaignEditor.tsx`
- In the `onMouseMove` handler (~line 2814), when `active` becomes true, also set `iframe.style.pointerEvents = 'none'`
- In `onMouseUp` and `onMouseLeave`, restore `iframe.style.pointerEvents = ''`

### Summary
Two targeted changes in one file — a cosmetic update to the delete button and a one-liner fix for drag-select traversal.

