

## Fix: Hero text elements not becoming editable / no floating toolbar

### Problem
The text editing initialization (injected iframe script, ~line 1462) makes elements `contentEditable` only if they match `h1,h2,h3,h4,h5,h6,p,span,a,li,button,label` **and** pass two filters:
1. `el.querySelector('img,table,div')` — searches the **entire subtree** for block elements
2. `Array.from(el.children).some(...)` — checks direct children for block tags

Hero headings and body text in email HTML often contain nested `<span>`, `<br>`, or even decorative `<div>` wrappers deep inside. The `querySelector` subtree search is overly aggressive — a single nested `<div>` anywhere in the tree disqualifies the entire element from editing. This means those elements never get `contentEditable = 'true'`, so focusing them does nothing and the floating toolbar never appears.

### Changes

**File: `src/pages/CampaignEditor.tsx`** (~line 1462-1465)

**Relax the block-child check to only inspect direct children instead of the full subtree.**

Replace:
```js
if(el.querySelector('img,table,div')) return;
var hasBlock = Array.from(el.children).some(function(c){ return blocks.indexOf(c.tagName)>=0; });
if(hasBlock) return;
```

With:
```js
var hasBlock = Array.from(el.children).some(function(c){ return blocks.indexOf(c.tagName)>=0; });
if(hasBlock) return;
```

This removes the deep subtree search (`querySelector`) and keeps only the direct-children check, which is sufficient to prevent making complex structural elements editable while still allowing hero headings that may have deeply nested inline markup.

### Why this works
- The direct-children check (`el.children`) already prevents making elements with `<table>`, `<div>`, `<img>` etc. as **immediate** children editable
- The removed `querySelector` was redundant but far more aggressive — it would disqualify an `<h1>` if any descendant at any depth was a `<div>`, even a harmless styling wrapper
- Hero text typically has inline children (`<span>`, `<strong>`, `<em>`, `<br>`) with no direct block children, so it will now correctly become editable

### One-line fix
Single deletion in the injected script block inside `CampaignEditor.tsx`.

