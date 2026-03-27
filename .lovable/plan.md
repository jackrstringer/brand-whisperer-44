

## Plan: Safe Inline Editing + Keyboard Undo/Redo

The current inline editing is too permissive — it sets `contentEditable` on elements like `td`, `a`, `span` which lets users accidentally copy/paste or delete structural HTML (tables, rows, images), breaking the email layout. The screenshot shows the injected script text leaking into the visible email content, confirming this.

### Problem Summary
1. **Copy/paste breaks layout** — pasting into contentEditable elements can inject raw HTML or destroy table structure
2. **No Ctrl+Z / Cmd+Z** — keyboard shortcuts for undo/redo aren't wired up
3. **Too many elements editable** — structural containers like `td` shouldn't be editable; only leaf text nodes should be

### Changes (single file: `src/pages/CampaignEditor.tsx`)

#### 1. Safer contentEditable targeting
Replace the current script injection with a smarter one that:
- Only targets **leaf text elements** — elements whose `textContent` is non-empty and that do NOT contain block-level children (tables, divs, other headings)
- Skips `td`, `th`, `a` that wrap images or other complex content
- Uses `plaintext-only` contentEditable value (where supported) to prevent rich paste from injecting HTML structure
- Adds a `paste` event handler that forces plain-text-only paste (`e.clipboardData.getData('text/plain')`) to prevent structure-breaking pastes
- Adds a `keydown` handler that prevents `Delete`/`Backspace` from removing the element itself when selection spans beyond the text node

#### 2. Keyboard undo/redo (Ctrl+Z / Cmd+Z)
- Add a `keydown` listener on the parent `window` that intercepts `Ctrl+Z` / `Cmd+Z` (undo) and `Ctrl+Shift+Z` / `Cmd+Shift+Z` (redo)
- Call `handleUndo` / `handleRedo` respectively and `preventDefault` to stop browser-native undo

#### 3. Prevent structural damage
- The injected script will intercept `beforeinput` events of type `deleteContentBackward`/`deleteContentForward` and cancel them if the selection would cross element boundaries
- On paste, strip all HTML and insert only plain text

### Technical Detail

**Injected iframe script** (replaces current):
```javascript
(function(){
  // Only make leaf text elements editable
  var blocks = ['TABLE','TR','TD','TH','DIV','UL','OL','IMG'];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,li,button,label').forEach(function(el){
    if(el.querySelector('img,table,div')) return;
    var hasBlock = Array.from(el.children).some(function(c){ return blocks.indexOf(c.tagName)>=0; });
    if(hasBlock) return;
    if(!el.textContent.trim()) return;
    el.contentEditable = 'plaintext-only';
    el.style.cursor = 'text';
  });
  // Force plain-text paste
  document.addEventListener('paste', function(e){
    if(!e.target.isContentEditable) return;
    e.preventDefault();
    var text = (e.clipboardData||window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  // Debounced sync back to parent
  var timer = null;
  document.addEventListener('input', function(){
    clearTimeout(timer);
    timer = setTimeout(function(){
      var clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script').forEach(function(s){s.remove();});
      clone.querySelectorAll('[contenteditable]').forEach(function(el){
        el.removeAttribute('contenteditable');
        el.style.removeProperty('cursor');
      });
      window.parent.postMessage({type:'textEdited', html:clone.outerHTML},'*');
    }, 300);
  });
})();
```

**Parent-side keyboard listener** (new `useEffect`):
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); }
    if (mod && e.key === 'y') { e.preventDefault(); handleRedo(); }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [handleUndo, handleRedo]);
```

This requires wrapping `handleUndo` and `handleRedo` in `useCallback`.

