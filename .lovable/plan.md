
Goal: make the floating toolbar fully functional (selected text + newly typed text), improve the color control quality, and ship a premium “enterprise” visual treatment with a high-tech outlined Ideate button.

1) Fix the core editing engine so toolbar commands actually apply
- Switch editable nodes from `contentEditable="plaintext-only"` to `contentEditable="true"` for toolbar-enabled elements.
- Keep safety protections: still only enable leaf text nodes; continue paste sanitization to plain text; continue blocking structural node edits.
- Add selection persistence:
  - Track last valid `Range` inside the active editable node on `selectionchange`.
  - Before applying any toolbar action, restore that saved range so format commands target the intended text.
- This resolves the current issue where commands appear to do nothing.

2) Make toolbar interaction stable (no accidental close / no lost selection)
- Replace current blanket `mousedown preventDefault` with scoped behavior:
  - Prevent default only on command buttons/swatch chips to preserve selection.
  - Allow native interaction for real form controls (select, color input, text input).
- Update hide logic to close only on true outside click, Escape, or explicit blur-away from both target + toolbar.
- Keep toolbar pinned to active element with robust reposition on scroll/resize.

3) Replace formatting actions with a reliable command layer
- Build `applyInlineCommand(command, value?)` wrapper that:
  - Restores selection range.
  - Runs command (`bold`, `italic`, `underline`, `foreColor`, `fontSize`, alignment).
  - Falls back to span-wrapping if browser command fails.
  - Calls `syncHtml()` once per action.
- Ensure collapsed-caret behavior works so new typing inherits selected style state.
- Keep active-state detection (B/I/U + alignment + current color + current size) synced to current caret/selection.

4) Upgrade the color control to a better “enterprise” picker
- Replace current tiny dropdown panel with a richer popover:
  - Brand/theme colors (from existing design tokens/current campaign colors).
  - Document-detected colors.
  - Recent colors row (session memory).
  - Native color input + HEX field for precision.
- Add selected-state ring + checkmark and improve spacing/contrast.
- Apply color to selection when text is selected, or as typing state when caret is collapsed.

5) Premium visual redesign of the toolbar
- Restyle toolbar to match app aesthetic (dark glass + subtle border glow + better spacing, icon rhythm, separators).
- Group controls into clear clusters: Type, Typography, Color, Emphasis, Alignment, AI.
- Improve iconography and hover/active/focus states for accessibility.

6) Ideate button redesign + stronger behavior
- Convert Ideate button to stroke-only gradient style (transparent fill, gradient border, high-tech look matching theme).
- Keep glow/hover animation subtle and premium.
- Upgrade ideate action to be truly automatic:
  - Send element context (tag, selected text or full element text, nearby context).
  - Trigger message generation flow directly (not only prefill input), so Lucy starts ideation immediately.

7) Persistence, cleanup, and undo integrity
- Ensure all toolbar edits call `syncHtml()` and push history at the right granularity.
- Keep cleanup stripping all toolbar/popover helper nodes/styles before syncing HTML.
- Preserve existing local text-session undo behavior inside active edit sessions and global undo behavior outside.

8) Validation pass (required before finalizing)
- Verify each control end-to-end on real content:
  - Existing selected text formatting works.
  - Newly typed text inherits active formatting.
  - Color picker (swatches + custom hex) works.
  - Toolbar stays open during interactions.
  - Ideate triggers immediate contextual suggestions.
  - Undo/redo semantics remain correct (local vs global).
- Check at least one long-form paragraph, one heading, and one CTA/link element.
  
Technical details
- File touched: `src/pages/CampaignEditor.tsx` only (injected iframe CSS/JS + parent message handling helper for ideate auto-send).
- Key refactor points:
  - Selection/range manager utilities in injected script.
  - Command wrapper + fallback span application.
  - New color popover UI structure/classes.
  - Ideate bridge from iframe message -> direct send function in parent.
- No backend/database schema changes required.
