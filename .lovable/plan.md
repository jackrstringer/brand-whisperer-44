

## Plan: Rich Floating Editor Toolbar

Add a Notion/ClickUp-style floating toolbar inside the iframe that appears when a user focuses on an editable text element. Includes formatting, sizing, text color, and an AI "Ideate" button.

### What the toolbar contains (left to right)

1. **Element type pill** — non-interactive label ("Heading", "Body", "Link", "Button")
2. **Separator**
3. **Font size** — dropdown or stepper (small/medium/large/XL, maps to px values)
4. **Text color** — small color swatch button that opens a mini palette picker (extracts existing colors from the email + a few defaults)
5. **Separator**
6. **Bold / Italic / Underline** — toggle buttons using `document.execCommand`, active state tracked via `queryCommandState`
7. **Text align** — Left / Center / Right cycle button
8. **Separator**
9. **✨ Ideate** — gradient accent button that sends the element text + tag to parent via `postMessage('ideateElement')`

### Behavior

- Appears on `focus` of any contentEditable element, positioned above it (flips below if near top)
- Repositions on scroll/resize
- Dismissed on `blur` (with 200ms delay so toolbar button clicks register), Escape key, or clicking outside
- `selectionchange` listener updates Bold/Italic/Underline active states in real-time
- All formatting changes trigger the existing `syncHtml()` to persist

### Font size implementation

- Wraps selected text (or full element if no selection) with a `<span style="font-size:Xpx">`
- Uses `document.execCommand('fontSize', false, size)` which creates `<font size>` tags, then immediately converts them to `<span style="font-size">` for clean HTML
- Preset options: 12px, 14px, 16px, 20px, 24px, 32px, 40px

### Text color implementation

- Small swatch button showing current computed color
- On click, shows a mini panel of colors extracted from the email (scan all inline `color:` styles) plus a few defaults (#000, #fff, #333, #666)
- Applies via `document.execCommand('foreColor', false, hex)`
- Clicking a color closes the panel

### Ideate button

- Reads `el.textContent` and `el.tagName`
- Posts `{ type: 'ideateElement', text, tagName }` to parent
- Parent composes a context-aware prompt and calls `sendMessage`

### Changes

**`src/pages/CampaignEditor.tsx`** — single file:

1. Add floating toolbar CSS to the injected `<style>` block (dark theme, blur backdrop, smooth animation)
2. Add floating toolbar JS to the injected `<script>` block:
   - Create toolbar DOM on focus, position with `getBoundingClientRect`
   - Wire up B/I/U buttons, font size dropdown, text color picker, align button, ideate button
   - Tear down on blur/escape
3. Add `ideateElement` handler in the parent `message` event listener — compose prompt from tag type and call `sendMessage`
4. Update `syncHtml` cleanup to strip `.floating-toolbar` elements and related styles

### Injected toolbar CSS (key styles)

```css
.ftb { position:fixed; z-index:99998; background:rgba(24,24,27,0.95);
  backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.1);
  border-radius:8px; padding:4px; display:flex; align-items:center; gap:2px;
  box-shadow:0 4px 16px rgba(0,0,0,0.5); animation:ftb-in 0.15s ease-out; }
@keyframes ftb-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
.ftb-btn { background:none; border:none; color:#aaa; width:28px; height:28px;
  border-radius:4px; cursor:pointer; font-size:13px; }
.ftb-btn:hover { background:rgba(255,255,255,0.1); color:#fff; }
.ftb-btn.active { background:rgba(99,102,241,0.3); color:#818cf8; }
.ftb-sep { width:1px; height:16px; background:rgba(255,255,255,0.15); margin:0 4px; }
.ftb-tag { font-size:10px; color:#888; text-transform:uppercase; padding:2px 6px; }
.ftb-ideate { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff;
  border:none; border-radius:6px; padding:4px 10px; font-size:11px; font-weight:600;
  cursor:pointer; display:flex; align-items:center; gap:4px; }
.ftb-select { background:#2a2a2e; color:#ccc; border:1px solid #444; border-radius:4px;
  font-size:11px; padding:2px 4px; cursor:pointer; }
.ftb-color-swatch { width:20px; height:20px; border-radius:4px; border:2px solid #555;
  cursor:pointer; }
.ftb-color-panel { position:absolute; top:100%; left:0; background:#1a1a1a;
  border:1px solid #333; border-radius:6px; padding:6px; display:flex; flex-wrap:wrap;
  gap:4px; margin-top:4px; }
```

