

## Two Features: Selection-Aware Chat + Figma-Style Comment Mode

### Feature 1: Preserve Selection When Typing in Chat

**Problem**: Clicking the chat textarea triggers the `handleOutsideClick` listener (line ~1520), which clears `selectedElementContext` and sends `clearSelection` to the iframe. The selection disappears before the user can type a message about it.

**Fix**:
1. **Guard the outside-click handler** (line ~1528): Add a check for the chat panel — if the click target is inside the right panel (chat area), skip deselection. The chat textarea, send button, and attachment area should all be excluded.
2. **Guard the keyboard handler** (line ~1494): Currently returns early for `INPUT`/`TEXTAREA` — this is correct and already prevents Delete/Backspace from firing. But Escape in chat should also not deselect. Add a guard so Escape only deselects when focus is NOT in the chat area.
3. **Keep the context chip visible** while typing — it already renders (line ~3641), this fix just ensures it stays populated.

**Files**: `src/pages/CampaignEditor.tsx` — modify the `handleOutsideClick` useEffect (~line 1520) to exclude the chat panel container.

---

### Feature 2: Figma-Style Comment Mode

**Overview**: Press `C` to enter comment mode. Click or click-drag on the preview to place a comment pin. A small bubble appears for typing. On submit, the system captures a screenshot of that area and sends it + the comment text to the edit AI. The AI response appears as a reply thread on that comment pin.

**State & Data Model**:
- New state: `commentMode: boolean`, `comments: CommentPin[]`, `activeCommentId: string | null`
- `CommentPin`: `{ id, x, y, width?, height?, text, screenshot?: string, aiReply?: string, status: 'draft' | 'pending' | 'resolved' }`
- Comments are session-local (no DB persistence needed initially — they're ephemeral like Figma comment threads during editing)

**Interaction Flow**:
1. **Toggle**: Press `C` when not focused on input → toggle `commentMode`. Show a subtle indicator ("Comment mode" badge near cursor or in toolbar).
2. **Click to comment**: In comment mode, clicking on the preview panel places a pin at that coordinate. A small floating input bubble appears anchored to the pin.
3. **Click-drag to comment**: Dragging draws a rectangular highlight (like marquee but for comments). On release, places a pin at the center of the rectangle. The drag region defines the screenshot capture area.
4. **Screenshot capture**: Use `html2canvas` on the iframe content at the click/drag coordinates. For click: capture a ~500×500px region centered on the click point. For drag: capture the dragged region + ~50px padding on each side. Convert to JPEG data URL.
5. **Submit comment**: When user types and presses Enter (or clicks send), construct a chat message that includes:
   - The screenshot as an attached image (same pipeline as `chatAttachments`)
   - The comment text prefixed with `[Visual comment at position X,Y]`
   - Send via existing `sendMessage` flow
6. **AI reply**: The AI response comes back through the normal streaming chat. Associate it with the comment pin by tracking which comment triggered the send. Display the reply in a small thread bubble anchored to the pin.

**Screenshot Capture Implementation**:
- Access `iframeRef.current.contentDocument.body`
- Use `html2canvas` (already a dependency) to render a cropped region
- For click: `{ x: clickX - 250, y: clickY - 250, width: 500, height: 500 }` (clamped to bounds)
- For drag: the exact drag rectangle + 50px padding
- Scale coordinates by `1/zoomScale` to get iframe-space coords
- Output as JPEG data URL, add to chat as an attachment image

**UI Components**:
- **Comment pins**: Small numbered circles rendered as absolute-positioned overlays on the preview panel (same layer as marquee rect)
- **Comment bubble**: A small popover anchored to the pin with a textarea + submit button
- **Reply thread**: Below the comment text, show the AI's response in a slightly different style
- **Toolbar indicator**: When comment mode is active, show a small "Comment Mode" badge or change cursor to crosshair

**New file**: `src/components/campaign/CommentOverlay.tsx` — renders all comment pins and the active comment bubble on top of the preview panel.

**Modified file**: `src/pages/CampaignEditor.tsx`:
- Add `commentMode`, `comments`, `activeCommentId` state
- Add `C` key handler in the keyboard shortcuts useEffect
- In comment mode, override the pointer handlers on the preview panel to place pins instead of selecting elements
- After comment submit, convert the comment into a chat message with screenshot attachment and send via `sendMessage`
- Track which comment triggered a send to associate the AI reply

### Files Summary

| File | Action |
|------|--------|
| `src/pages/CampaignEditor.tsx` | Modify: outside-click guard, keyboard handler for `C`, comment mode state + pointer overrides, comment-to-chat bridge |
| `src/components/campaign/CommentOverlay.tsx` | Create: renders pins, active bubble, reply threads |

