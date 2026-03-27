

## Plan: Inline Text Editing + Undo/Redo Toolbar

### 1. Inline Text Editing in Campaign Preview

**Approach**: Make the iframe's `contentEditable` work by changing the sandbox attribute to `allow-same-origin allow-scripts`, then injecting a small script into the `srcdocHtml` that:
- Sets `document.body.contentEditable = true` on all text-containing elements (headings, paragraphs, spans, links, tds)
- On blur/input of any editable element, sends a `postMessage` back to the parent with the updated full HTML (`document.documentElement.outerHTML`)
- The parent listens for these messages, pushes the old HTML onto `html_history`, and updates `campaign.html` with the new content

Visual cues: Inject CSS so editable text gets a subtle dashed outline on hover and a light highlight on focus, making it clear the text is editable without being distracting.

**Parent-side handler** in `CampaignEditor.tsx`:
- Listen for `message` events with `type: 'textEdited'`
- Debounce saves (500ms) so rapid typing doesn't spam the DB
- Before saving, push current HTML to history (enabling undo)
- Update `campaign.html` state + persist to Supabase

### 2. Undo / Redo Buttons in Top Bar

Currently there's a `handleUndo` function and `canUndo` state, but no visible undo button in the top bar, and no redo support.

**Changes**:
- Add a `redoStack` state (`string[]`) — when the user undoes, the popped HTML goes onto the redo stack. Any new edit clears the redo stack.
- Add `handleRedo`: pops from redo stack, pushes current HTML to history, updates campaign
- Place Undo (`Undo2` icon) and Redo (`Redo2` icon) buttons in the top bar next to the export/review buttons, disabled when their respective stacks are empty
- Wire inline text edits into the same history system so they're also undoable

### Files to modify

1. **`src/pages/CampaignEditor.tsx`**
   - Add `redoStack` state
   - Update `handleUndo` to push to redo stack
   - Add `handleRedo` function
   - Update `srcdocHtml` injection to include contentEditable script + styles
   - Change iframe sandbox to `allow-same-origin allow-scripts`
   - Add `message` event listener for `textEdited` events from iframe
   - Add Undo/Redo buttons to the top bar (next to Export HTML)
   - Clear redo stack on new edits (chat edits, variant applies, inline edits)

