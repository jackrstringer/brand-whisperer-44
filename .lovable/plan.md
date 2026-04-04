

## Fix Undo/Redo Lag — Add Missing `loadHtml` Handler in Iframe

### Root Cause

The undo/redo handlers post `{ type: 'loadHtml', html }` to the iframe, but **there is no handler for `loadHtml` inside the iframe script**. The iframe never receives and applies the HTML. Instead, the update only happens when React re-renders with a new `srcdocHtml` via the `srcDoc` prop — which triggers a **full iframe document reload** (browsers treat any `srcDoc` change as a navigation). This causes the visible lag/flash.

### Fix

**a) Add a `loadHtml` message handler inside the iframe's injected script** (~line 2530 area, alongside the other `window.addEventListener('message', ...)` handlers). When received, it replaces `document.documentElement.innerHTML` with the new HTML, then re-runs the initialization logic (making elements contentEditable, re-attaching section wrappers, etc.).

**b) Prevent React from also reloading the iframe via `srcDoc`.** The undo/redo handlers already set `iframeOwnedHtmlRef.current`, but `setCampaign` still updates `campaign.html` which flows into `displayHtml` → `htmlForPreview` → `srcdocHtml`. Since React sees a new `srcDoc` string, the browser reloads the iframe — undoing the fast `loadHtml` update and causing the flash. Fix: gate the `srcdocHtml` computation so that when `iframeOwnedHtmlRef.current` is set, use the **previous** srcdoc value (skip the update), letting the iframe's internal `loadHtml` handler be the sole update path.

**c) The `loadHtml` handler needs to re-initialize the interactive features** (contentEditable, section wrappers, hover listeners) after replacing the DOM. Extract the initialization code into a named function (e.g., `reinit()`) that can be called both on initial load and after `loadHtml`.

### Files changed
- `src/pages/CampaignEditor.tsx`:
  - Add `loadHtml` message handler in the iframe's injected script
  - Extract element initialization into a reusable `reinit()` function
  - Gate `srcdocHtml` to skip updates when `iframeOwnedHtmlRef.current` is set

