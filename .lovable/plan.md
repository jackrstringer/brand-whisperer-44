

# Three Independent Preview Controls

## What You Get

Three labeled numeric inputs in the toolbar, each showing real pixel values:

1. **Render Width** — the iframe's actual CSS `width` (the HTML layout width). Currently hardcoded at 431px. You'll be able to type any value (e.g. 375, 431, 600) and the email HTML reflows to that width.

2. **Viewport Width** — the visible window/container that clips the iframe. Independent of render width. If viewport < render, the email gets clipped. If viewport > render, you see whitespace around it.

3. **Screen Zoom** — CSS `transform: scale()` that makes the whole thing bigger or smaller on your screen without changing either width. Just visual scaling.

All three show their current pixel value and are directly editable via number inputs.

## Changes — `src/pages/CampaignEditor.tsx` only

### State
Replace single `zoom` state with three:
- `renderWidth` (default 431) — sets `iframe { width: renderWidth }`
- `viewportWidth` (default 431) — sets wrapper div `width: viewportWidth * screenZoom`
- `screenZoom` (default 100, percentage) — sets `transform: scale(screenZoom/100)`

### Toolbar
Replace the current zoom slider control block with three compact labeled number inputs:
```
Render: [431]px  |  Viewport: [431]px  |  Zoom: [100]%
```
Each is a small `<input type="number">` with step buttons, showing exact values.

### Preview rendering
- Iframe gets `width: renderWidth` and `height: iframeContentHeight`
- Iframe gets `transform: scale(screenZoom/100)` with `transform-origin: top left`
- Wrapper div gets `width: viewportWidth * (screenZoom/100)` and `height: iframeContentHeight * (screenZoom/100)` with `overflow: hidden`
- The wrapper is centered in the panel via the existing `flex justify-center`

### Remove
- Remove the old `IFRAME_WIDTH` constant, `zoom` state, and the zoom slider/buttons
- Remove the desktop/mobile toggle (these three controls supersede it)

