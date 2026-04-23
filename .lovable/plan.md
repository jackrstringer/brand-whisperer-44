
Implement the campaign preview as a minimal, stable in-canvas panel that stays at a fixed screen size and does not glitch when opened.

1. Fix the open-position glitch
   - Move the campaign preview rendering out of the zoom-transformed `.fl-viewport`.
   - Render it as an absolute overlay inside `.fl-stage` instead, using the clicked node’s screen-space position.
   - This prevents the “jump to top of screen then open” behavior caused by mixing canvas coordinates with transformed zoom/pan coordinates.

2. Make preview size independent from canvas zoom
   - Compute the preview’s screen position from:
     - node canvas coordinates
     - current `pan`
     - current `zoom`
     - node dimensions
   - Keep the preview panel itself unscaled.
   - Set a fixed standard preview width, e.g. `430px` panel shell with a `390px` email iframe viewport.
   - When the user zooms in/out while the preview is already open, recompute only its anchor position, not its width.

3. Keep the preview beside the message node
   - Anchor the panel to the right side of the selected message node by default.
   - If there is not enough room on the right, flip it to the left side.
   - Clamp the panel within the visible canvas area so it never renders partly off-screen.

4. Remove visible scrollbars
   - Apply scrollbar-hidden styling to the preview scroll container.
   - Preserve vertical scrolling via wheel/trackpad/touch.
   - Do not use any fake scrolling affordances or overlays.

5. Simplify the preview header content
   - Header top row:
     - Message title only, e.g. “Welcome + offer delivery”
     - Compact action icons on the right:
       - Open in editor
       - Regenerate
       - Close
   - Remove:
     - “Email · Preview”
     - “To <customer@example.com>”
     - duplicate title/subject restatement
   - Replace the current envelope area with two compact metadata rows:
     - `SL` label + subject line
     - `PT` label + preview text
   - Use the subject line from `campaignMeta.subject_line` first, then fallback to node metadata.
   - Use preview text from `campaignMeta.preview_text` first, then fallback to node metadata.

6. Remove the bottom action bar
   - Delete `.fl-canvas-preview-actions` from the preview structure.
   - Move “Open in Editor” and “Regenerate” into the header as icon buttons.
   - Keep button hover states crisp and minimal.

7. Make the panel visually cleaner
   - Use the same background as the canvas/page surface instead of a darker preview background.
   - Rely on thin strokes, subtle dividers, and radius rather than heavy shadows or darkened sections.
   - Remove the darker email frame background.
   - Keep the email iframe white and centered at 390px.
   - Reduce visual density around the subject/pretext metadata.

8. Implementation targets
   - Update `src/components/flows/SkeletonViewer.tsx`:
     - Replace the current transformed `CanvasCampaignPreview` placement with stage-level screen-space placement.
     - Store the currently previewed node/email index as-is, but render the preview outside `.fl-viewport`.
     - Add helper logic to calculate fixed-size preview position based on `pan`, `zoom`, stage bounds, and node bounds.
     - Update preview header markup and remove footer actions.
   - Update `src/index.css`:
     - Rewrite `.fl-canvas-preview*` styles for fixed-size, scrollbar-hidden, minimal in-canvas panel.
     - Remove/stop using footer action styles.
     - Add compact header icon button styling and `SL` / `PT` metadata row styling.

9. Expected behavior after implementation
   - Clicking the bottom half of a generated message node opens the preview next to that node.
   - The preview no longer jumps to the top before opening.
   - The preview remains a constant width regardless of canvas zoom.
   - The user can continue navigating the canvas while the preview is open.
   - The preview is minimal: title, SL/PT metadata, email render, and compact top-right actions only.
