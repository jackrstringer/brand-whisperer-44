
Implement the requested flow-canvas cleanup for the campaign preview and node shapes.

1. Fix preview text wrapping
   - Update the campaign preview metadata rows so `SL` and `PT` content wraps naturally instead of clipping.
   - Remove `white-space: nowrap`, `overflow: hidden`, and `text-overflow: ellipsis` from `.fl-canvas-preview-line p`.
   - Keep the labels compact and fixed-width, while allowing the subject/preheader text to use multiple lines.

2. Remove all visible scrollbars from the campaign preview
   - Apply hidden-scrollbar rules to the preview container and iframe wrapper:
     - `scrollbar-width: none`
     - `-ms-overflow-style: none`
     - `::-webkit-scrollbar { display: none; width: 0; height: 0; }`
   - Preserve normal wheel/trackpad/touch scrolling.
   - Ensure no scrollbar thumb/handle appears in the preview panel.

3. Resize the in-canvas preview relative to the message module
   - Change the campaign preview panel from a fixed `430px` shell to a size based on the message node width.
   - Since the message node width will be widened, set the preview shell around `1.25x` the message node width.
   - Keep it anchored beside the selected message node without resizing based on canvas zoom.
   - Keep the panel position recomputed from `node.x/y`, `pan`, and `zoom`, but only for anchoring—not visual scaling.

4. Toggle preview collapse from the bottom half of the node
   - Change the bottom-half click behavior so clicking the same rendered message preview again closes it.
   - If another message preview is open, clicking a different generated message bottom half switches the preview to that message.
   - Keep top-half clicks opening the full detail flyout.

5. Remove the thumbnail expand icon
   - Delete the overlay `Maximize2` icon from the small campaign thumbnail in `MessagePreview`.
   - Keep the thumbnail itself clickable/hoverable as the bottom-half preview target.
   - Preserve the thumbnail hover state without adding any extra overlay controls.

6. Reduce clipping inside message nodes
   - Increase the default email/message node width slightly.
   - Update `getNodeSize()` for email/SMS nodes and corresponding CSS min-widths so labels, subjects, and preview text have more room.
   - Allow important node text to wrap where appropriate instead of clipping aggressively.
   - Keep the node height stable enough to avoid layout jitter.

7. Simplify time delay nodes
   - Make delay nodes smaller and less intrusive.
   - Reduce delay node width/height in `getNodeSize("delay")`.
   - Simplify the rendered content to a compact icon/title/value treatment.
   - Remove unnecessary visual density from the delay body while retaining a clear hover and selected state.

8. Simplify conditional split nodes
   - Reduce split node width/height in `getNodeSize("split")`.
   - Remove the textual YES/NO branch breakdown inside the split node.
   - Remove the “Branches not specified” message entirely.
   - Keep only the split title/condition inside the node, while relying on the existing canvas path labels for YES and NO.

9. Update implementation files
   - `src/components/flows/SkeletonViewer.tsx`
     - Adjust node sizing constants.
     - Toggle preview open/close when bottom half is clicked.
     - Pass preview panel width from node width.
     - Remove thumbnail expand icon markup.
     - Simplify delay and split node rendering.
   - `src/index.css`
     - Rewrite preview wrapping and scrollbar hiding styles.
     - Update message node width/typography styles.
     - Update compact delay/split node styles.
     - Preserve crisp hover/selected states without movement or jitter.

Expected result:
- Subject line and preview text wrap instead of clipping.
- No visible scrollbar or scrollbar handle appears in the campaign preview.
- The preview is anchored beside the module and sized around the module width rather than a large fixed standard width.
- Clicking the bottom half of the same message toggles the preview closed.
- The thumbnail has no expand icon overlay.
- Message node text clips less because nodes are slightly wider and text rules are improved.
- Delay and split nodes become compact and clean, with YES/NO shown only on the paths.
