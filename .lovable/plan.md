

## Plan: Clean Ideate UX with Fake Placeholder Message

### Problem
When clicking "Ideate," the full verbose prompt (with raw HTML/styles) is displayed in chat as the user message. It's ugly and exposes implementation details.

### Solution
Instead of setting `chatInput` and clicking the send button (which shows the prompt), call `sendMessage` directly with a hidden prompt, while displaying a clean fake user message in chat.

### Changes (single file: `src/pages/CampaignEditor.tsx`)

1. **Add an internal "ideate" flag** — a ref (`ideatePayloadRef`) that holds the real prompt + a short display label when an ideate request is in flight.

2. **Rewrite the `ideateElement` handler** — instead of setting `chatInput` and simulating a button click:
   - Store the full verbose prompt in `ideatePayloadRef`
   - Call `sendMessage()` directly

3. **Modify `sendMessage`** — at the top, check `ideatePayloadRef.current`:
   - If set, use its `displayText` (e.g. "✨ Ideate: headline alternatives") as the visible user message
   - Use its `realPrompt` as the actual prompt sent to the edge function
   - Clear the ref after consuming
   - This keeps the ugly prompt hidden from the chat UI

4. **Show a polished thinking state** — the existing `agentState === "thinking"` indicator already renders. Enhance it slightly:
   - Show a branded "Generating ideas..." label with a sparkle icon and animated dots
   - The natural 3-5s AI response time provides the built-in delay before variants stream in

### What the user sees
- Click Ideate on a heading → chat shows: `"✨ Ideate headline"` (short, clean)
- Below it: animated thinking indicator with "Generating ideas..."
- Then variants stream in as cards

### Technical detail
```typescript
// New ref
const ideatePayloadRef = useRef<{ realPrompt: string; displayText: string } | null>(null);

// In ideateElement handler (replaces setChatInput + setTimeout click):
ideatePayloadRef.current = { realPrompt: prompt, displayText };
sendMessage();

// In sendMessage, at the top:
const ideateOverride = ideatePayloadRef.current;
ideatePayloadRef.current = null;
const userMsg = ideateOverride ? ideateOverride.realPrompt : chatInput.trim();
const displayContent = ideateOverride ? ideateOverride.displayText : /* existing logic */;
```

