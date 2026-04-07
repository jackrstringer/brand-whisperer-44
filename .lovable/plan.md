

## Plan: Precise Element Targeting for Comments + Clean Chat Display

### Problem
1. **Imprecise targeting**: The screenshot-only approach (400px square) gives the AI too much visual context without specifying which exact element the user clicked on. A CTA click captures surrounding images too, causing the AI to swap the wrong thing.
2. **Ugly chat messages**: Comment prompts like `[Visual comment at position (234, 567)]...` appear raw in chat instead of using the clean ideate-style hidden prompt pattern.

### Solution

#### Part 1: Element-Level Precision via postMessage

Instead of relying solely on screenshot coordinates, query the iframe for the actual HTML element(s) at the click/drag location. This gives the AI both the visual context AND the specific element markup.

**How it works:**
- When placing a comment pin, send a `postMessage` to the iframe: `{ type: 'getElementAtPoint', x, y }` (for point clicks) or `{ type: 'getElementsInRegion', rect: {x,y,w,h} }` (for drag regions).
- The iframe script uses `document.elementFromPoint(x, y)` or iterates elements to find those within the rect, then replies with `{ type: 'commentElementInfo', tagName, text, outerHTML, allElements: [...] }`.
- Store this element info on the `CommentThread` object: `thread.pin.elementInfo?: { tagName: string; text: string; outerHTML: string; elements?: {tagName: string; text: string; outerHTML: string}[] }`.
- When sending swap/ideate/comment prompts, include the element HTML alongside the screenshot. The prompt becomes: `"The user clicked on this specific element: <a class='btn'>Shop Now</a>. Here is a screenshot of the surrounding area for visual context."` This disambiguates between adjacent elements.

**Files**: `src/pages/CampaignEditor.tsx`
- Add `getElementAtPoint` / `getElementsInRegion` postMessage types to the iframe script injection (around line ~2900 where the existing iframe script is).
- Add a message listener for `commentElementInfo` responses.
- Store element info on the thread's pin object.
- Update `handleCommentSubmitNew`, `handleCommentSwap`, `handleCommentIdeate` to include element HTML in the prompt.

#### Part 2: Clean Chat Display (Hidden Prompts)

Use the existing `ideatePayloadRef` pattern for ALL comment-originated messages (not just ideate). The real prompt with coordinates, element HTML, and screenshot context is sent to the AI, but the chat shows a clean, short display message.

**Display messages:**
- New comment: `"💬 Comment: {user's text}"` (no coordinates, no element HTML shown)
- Swap: `"🔄 Swap element"` (already done, but ensure it uses ideatePayloadRef)
- Reply: `"💬 Reply: {user's text}"`

**Implementation:**
- In `handleCommentSubmitNew` and `handleCommentReply`: wrap the verbose prompt in `ideatePayloadRef` just like ideate does, with a clean `displayText`.
- In `handleCommentSwap`: already shows "🔄 Auto-swap element" as the thread comment, but the chat message still shows the raw prompt. Route through `ideatePayloadRef` with `displayText: "🔄 Swap: Auto-replace element"`.

**Files**: `src/pages/CampaignEditor.tsx` — modify the four comment handler functions to use `ideatePayloadRef`.

#### Part 3: Update CommentThread Type

**Files**: `src/components/campaign/CommentOverlay.tsx`
- Extend the `CommentThread` pin type to include optional `elementInfo`.

### Technical Details

```text
User clicks on CTA button in email
         │
         ▼
  postMessage → iframe
  { type: 'getElementAtPoint', x: 234, y: 567 }
         │
         ▼
  iframe replies with:
  { tagName: 'A', text: 'Shop Now', 
    outerHTML: '<a href="..." class="btn">Shop Now</a>' }
         │
         ▼
  Stored on thread.pin.elementInfo
         │
         ▼
  AI prompt (hidden from chat):
  "[Targeting <A> element: 'Shop Now']
   Element HTML: <a href='...' class='btn'>Shop Now</a>
   
   Swap this element with a better alternative..."
  + screenshot attachment for visual context
         │
         ▼
  Chat display (visible): "🔄 Swap element"
```

### Files Summary

| File | Changes |
|------|---------|
| `src/pages/CampaignEditor.tsx` | Add postMessage element query to iframe script; update all 4 comment handlers to include element info in prompts and use ideatePayloadRef for clean display |
| `src/components/campaign/CommentOverlay.tsx` | Extend `CommentThread` pin type with optional `elementInfo` field |

