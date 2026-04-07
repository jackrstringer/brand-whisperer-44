
Goal: make the editor always persist the true current manual state, even if you leave the campaign within about a second.

What I found
- This is a client-side timing bug, not a backend/schema problem.
- Manual edits are delayed twice right now:
  1. inside the preview iframe, `syncHtml()` waits 1500ms before sending the latest HTML up
  2. in the page, `CampaignEditor` waits another 800ms before saving to the database
- So the real save path is over 2 seconds long.
- If you type, swap an image, tweak styling, or delete/reorder something and then leave quickly, the iframe gets destroyed before it has posted the latest DOM. At that point the page has nothing real to flush, so it reloads the older chat-generated HTML.
- Image swaps and most manual formatting actions use this same delayed iframe sync path, so they can all be lost the same way.
- Manual edits also are not keeping the live variant snapshot aligned, which can make the campaign feel like it snaps back to the last AI-generated version.

Implementation plan

1. Replace the current double-debounce autosave path with one save pipeline in `src/pages/CampaignEditor.tsx`.
- Add a shared save helper that becomes the single source of truth for manual edits.
- It should update local state immediately, update the pending-save ref immediately, and persist with only a short debounce.

2. Refactor the injected iframe editor script to emit current HTML much faster.
- Split the current `syncHtml()` into:
  - serialize current clean HTML
  - short debounced emit for typing
  - immediate emit for non-typing actions
- Reduce typing delay from 1500ms to a small idle window.
- Emit immediately for image swaps, delete/duplicate/reorder, toolbar formatting, spacing/alignment/font changes, and other direct DOM edits.

3. Add explicit leave/blur flushing.
- Have the iframe flush its latest HTML on blur/focusout.
- Add a parent-side “flush editor now” request before internal navigations from this screen, especially:
  - back to campaigns
  - Review & Send
  - any other route change triggered inside the editor
- Keep the current unmount cleanup, but make it flush real latest HTML instead of stale state.

4. Stop relying on stale render closures during save.
- Move latest campaign HTML/history/active-variant data into refs used by the save pipeline.
- This prevents quick consecutive manual edits from being calculated against older state.

5. Keep variants in sync with manual edits.
- When the active version is manually edited, sync that HTML back into the current variant snapshot before persistence.
- That prevents the editor from restoring an older AI-generated version after re-entry.

Files to update
- `src/pages/CampaignEditor.tsx`
  - refactor iframe edit serialization
  - shorten autosave timing
  - add blur/navigation flush
  - unify manual save logic
  - sync edited variant HTML with the live campaign state

Technical details
```text
Current:
manual edit -> iframe waits 1500ms -> page waits 800ms -> save

Problem:
leave early -> latest DOM never reaches the page -> old HTML is what comes back

Fixed:
manual edit -> iframe emits quickly / on blur -> page updates immediately
            -> short save debounce + explicit flush before leaving
```

Validation
- Edit text and leave within 1 second; reopen and confirm the exact text persists.
- Swap an image and leave immediately; reopen and confirm the new image persists.
- Change manual styling and reopen; confirm it persists.
- Delete/duplicate/reorder a section and reopen; confirm current layout persists.
- Manually edit a generated version, leave, return, and confirm it does not revert to the last chat-generated snapshot.
- Reload the browser after a quick manual edit and confirm the latest on-screen state is what reloads.
