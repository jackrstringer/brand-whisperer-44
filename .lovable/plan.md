
## Plan: Fully lock left-click text editing for dynamic flow fields

### What’s actually wrong
This is not primarily a backend/rendering issue. The bug is in the injected iframe editor logic inside `src/pages/CampaignEditor.tsx`.

Right now, dynamic Liquid markers are injected onto inner spans like `{{ event... }}`, but the parent text element (`p`, `h1`, `a`, etc.) can still be marked `contentEditable="true"` because the current `isDynamic()` check only looks at the element and its ancestors, not dynamic descendants.

So for a line like:
```text
Qty: {{ event.qty }} · ${{ event.price }}
```
the parent text block is still editable on left click, which lets the caret enter that block and can corrupt the live rendered preview state.

The current parent-side save guard (`if (flowPreviewHtml) return`) is not enough, because it only blocks persistence after the DOM was already made editable. The fix needs to happen inside the iframe before editing can start.

## Changes

### 1) Harden dynamic-field detection in the iframe editor
Update the injected editor script in `src/pages/CampaignEditor.tsx` so a text element is treated as protected if it:
- is dynamic itself
- has a dynamic ancestor
- contains dynamic descendants like:
  - `[data-liquid]`
  - `[data-liquid-attr]`
  - `[data-liquid-loop]`

This means any mixed static/dynamic text block gets locked as a whole, which is the safer behavior.

### 2) Prevent left-click from entering text-edit mode on protected blocks
For protected dynamic elements:
- do not set `contentEditable`
- block caret placement/focus on normal left click
- keep them selectable so the floating toolbar can still appear
- keep right-click “Edit Text” unavailable

This will make dynamic fields feel non-editable immediately, which matches the expected UX.

### 3) Preserve formatting controls for dynamic fields
Keep dynamic fields style-editable, but only through source-aware updates:
- use the toolbar for allowed formatting changes
- route those changes through `flowStyleEdit`
- patch the source Liquid HTML, then re-render the preview with live event data

I’ll extend this so dynamic fields do not fall back to `syncHtmlImmediate()` for style actions that should be supported. The goal is:
- no content editing
- formatting still works
- switching preview events still updates the values correctly

### 4) Improve Liquid-path targeting for mixed dynamic blocks
Add a helper so protected parent blocks can resolve a usable Liquid path from:
- their own marker, or
- the first descendant dynamic marker

That gives the style patcher a stable way to find the correct source tag even when the clicked element is the parent wrapper rather than the exact inner span.

### 5) Keep serialization clean
If any new protection/helper attributes are added in the iframe, strip them during serialization just like the existing editor-only attributes.

## Files to update
- `src/pages/CampaignEditor.tsx`
  - injected iframe editor script:
    - dynamic detection
    - editable/protected assignment
    - left-click interception
    - toolbar routing for protected fields
    - clean serialization
  - parent message handling for `flowStyleEdit` if needed to support the protected-field formatting actions cleanly

## Technical details
- Root cause: `isDynamic(el)` is ancestor-only, so parent text wrappers around injected Liquid spans remain editable.
- Correct fix: lock the whole containing text block if it contains dynamic content anywhere inside it.
- Important behavior change: in flow preview, protected dynamic blocks should never enter native text-edit mode at all.
- Safety rule: if a style patch cannot be mapped back to source Liquid HTML, it should fail visibly rather than silently turning into a direct text edit.

## Verification
After implementation, I’ll verify:
1. Left-clicking a dynamic field does not place a caret.
2. Typing cannot alter dynamic content blocks.
3. Toolbar formatting still works on protected dynamic fields.
4. Switching between preview events updates the values correctly.
5. Static text remains normally editable.
