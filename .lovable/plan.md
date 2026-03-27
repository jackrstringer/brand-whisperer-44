
Goal: make the editor stable and predictable (65% left / 35% right, no overlap), and make zoom actually shrink campaign cards so 8 fit across at max zoom-out.

1) Lock the editor into two non-overlapping panes
- In `src/pages/CampaignEditor.tsx`, remove the resizable panel usage for this screen.
- Replace it with a fixed 2-column layout (`65%` left, `35%` right) using a single parent container with `min-w-0 overflow-hidden`.
- Add strict clipping (`overflow-x-hidden`) on the left pane and `overflow-hidden` on the right pane so content can never paint into the other pane.
- Keep the right pane exclusively for Campaign Brief UI.

2) Fix why zoom currently “does nothing”
- In `src/components/campaign/ReferencePanel.tsx`, keep the 1–8 column zoom mapping but ensure the cards can physically shrink.
- Root issue: iframe-based thumbnails have a fixed intrinsic width (`470px`) that can force overflow in masonry columns.
- Update `CampaignIframeThumbnail` so the iframe is absolutely positioned inside a `relative w-full min-w-0 overflow-hidden` wrapper; wrapper width drives scale.
- Ensure card wrappers also use `min-w-0 w-full` so column width always wins.

3) Keep masonry dense with tighter spacing
- Preserve masonry behavior (no large vertical holes) via CSS columns.
- Reduce spacing to be very tight: e.g. container padding `0`, `columnGap: 2`, item bottom spacing `2px`.
- Keep `breakInside: avoid` per item so full cards stay intact.

4) Make zoom behavior explicit and reliable
- Keep slider range 0–100 mapped to columns 8→1.
- Display current column count next to zoom control (e.g. “8 wide”, “1 wide”) so the effect is visible/traceable.
- Default zoom value set so initial view is practical (e.g. ~3 wide), but max zoom-out must force 8 columns.

5) Validation pass (same route/screen)
- Confirm no pane overlap at all states (draft/editor, with/without generated campaign).
- At max zoom-out, verify 8 cards fit side-by-side in the left 65% pane (using current viewport scale).
- At max zoom-in, verify 1 column.
- Verify spacing remains tight both horizontally and vertically in Library / My Campaigns / Saved tabs.
