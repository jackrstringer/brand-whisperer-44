
Goal: make every manual change persist as the true current campaign state, even if you leave immediately.

What I found
- The current fix still misses the latest manual DOM on exit.
- Back / Review & Send / unmount only flush `pendingSaveRef`; they do not ask the iframe for a fresh snapshot first.
- `pendingSaveRef` is cleared before the async database update finishes, so leaving during that request removes the fallback.
- Several manual paths still read from `campaign.html` instead of the newest iframe-owned HTML, which lets the last chat-generated state win.
- That is why reopening falls back to the most recent chat edit: the database never received the true latest iframe DOM.

Implementation plan

1. Replace the current debounce/flush logic with one authoritative manual-save controller in `src/pages/CampaignEditor.tsx`.
- Track latest HTML/history/variant HTMLs, dirty state, and in-flight save promise in refs.
- Do not clear pending state until persistence actually succeeds.
- Coalesce saves instead of letting navigation race an in-flight request.

2. Add an explicit parent ↔ iframe snapshot handshake.
- In the injected iframe script, add a `flushEditorSnapshot` message that immediately serializes clean HTML and posts it back.
- Before any internal navigation or screen exit, await that snapshot once, then persist it.
- Use the same immediate snapshot for image swaps, delete/duplicate/reorder, toolbar edits, and blur/focusout.

3. Route every manual mutation through the same save helper.
- Text edits
- image swaps
- delete/duplicate/reorder
- color/style/padding/alignment changes
- undo/redo
- grouped apply commits
This prevents some paths from writing stale `campaign.html` while others use live iframe state.

4. Make internal navigation actually wait for persistence.
- Replace the current fire-and-forget back / Review & Send handlers with `await flushLatestManualState()` before `navigate(...)`.
- Keep unmount/beforeunload as fallback only; the real guarantee should happen before route changes.

5. Add a local draft fallback for true zero-loss recovery.
- On every manual edit snapshot, also store a campaign-scoped local draft `{ html, history, variantHtmls, timestamp }`.
- On load, if a local draft is newer than the loaded campaign state, restore it immediately and persist it in the background.
- This covers hard refresh/close cases where the browser may not wait for a network update.

6. Keep variants aligned with manual edits.
- Update the active entry inside `variant_htmls` whenever the live variant is manually changed.
- Make all apply/switch/save paths read from the latest manual HTML ref first, not stale render state.

Files to update
- `src/pages/CampaignEditor.tsx`
  - replace the current pending-save logic
  - add iframe snapshot request/response flush
  - unify all manual edits through one save helper
  - await flush before navigation
  - add local draft recovery
  - sync active variant HTML on every manual change

Technical details
```text
Current broken path:
manual edit -> iframe may not emit in time
            -> pending ref may clear before save finishes
            -> navigate away
            -> reload shows last chat-written html

Fixed path:
manual edit -> iframe snapshot updates latest refs immediately
            -> local draft written immediately
            -> short debounced cloud save
leave screen -> request fresh iframe snapshot -> await save -> navigate
reload      -> restore newest saved/manual state, not last chat state
```

Validation
- Edit text and leave within 1 second; reopen and confirm exact text persists.
- Swap an image and leave immediately; reopen and confirm the swapped image persists.
- Change font/color/padding/alignment and confirm it survives re-entry.
- Delete/duplicate/reorder a section and confirm the layout persists.
- Undo/redo, then leave and reopen; confirm the visible state is what returns.
- Manually edit a non-primary variant, leave, return, and confirm it does not snap back to the last chat-generated version.
- Hard refresh right after a manual edit and confirm the latest state is restored.
