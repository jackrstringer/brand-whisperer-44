

# Fix Mobile Email Preview — Correct Scaling Approach

## The Problem
Currently rendering the email at 600px and scaling *down*, making everything tiny. The user wants the opposite: render at 375px (true mobile Gmail viewport) and scale *up* to fill the panel.

## The Fix

**Single file change:** `src/pages/CampaignEditor.tsx`

### New approach (lines ~160-270):

1. **Add a ref** to the preview container div to measure its actual width dynamically
2. **Add state** for `containerWidth` updated via `ResizeObserver` on the preview panel
3. **Mobile mode iframe**: set iframe width to exactly `375px` — the email HTML renders as if it's in a 375px mobile viewport (accurate Gmail mobile simulation)
4. **Scale factor**: `containerWidth / 375` — scales the 375px iframe up to fill the available panel width
5. **Wrapper div**: `overflow: hidden`, height set to `iframeContentHeight * scaleFactor` so the outer panel scrolls naturally
6. **Transform**: `transform: scale(scaleFactor)`, `transformOrigin: top left` on the iframe wrapper
7. **Desktop mode**: unchanged — iframe at 600px, no transform, centered in panel

### Pseudo-structure for mobile:
```text
<div ref={previewRef} className="w-[60%] overflow-y-auto">  ← measures containerWidth
  <div style={{ width: containerWidth, height: contentHeight * scale, overflow: 'hidden' }}>  ← clip wrapper
    <div style={{ transform: scale(X), transformOrigin: 'top left', width: 375 }}>
      <iframe width=375 />  ← email thinks it's on mobile
    </div>
  </div>
</div>
```

### Key details:
- Remove all existing `mobileScale`, `mobileViewportWidth`, `emailNativeWidth` scaling logic for mobile
- Keep `emailNativeWidth = 600` for desktop only
- `onLoad` handler: read `doc.body.scrollHeight`, store in state, iframe height = scrollHeight, wrapper height = scrollHeight * scale
- No zoom controls needed — the email auto-fills the panel width

