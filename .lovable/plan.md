

## Plan: Move variant tabs left, collapse zoom controls into expandable icon

### Problem
The centered variant tabs and "Save as New Campaign" button overlap with right-side elements (Undo/Redo, zoom controls, Export, Review). The zoom controls take up significant horizontal space.

### Changes

**File: `src/pages/CampaignEditor.tsx`**

**1. Move variant tabs from absolute-centered to left-aligned (after campaign name/badges)**
- Remove the `absolute left-1/2 -translate-x-1/2 -translate-y-1/2` positioning
- Place the variant tabs + "Save as New Campaign" button inside the left `<div>` section, after the status badge and star/eye icons
- This eliminates overlap with right-side controls

**2. Collapse zoom/view controls into a popover**
- Replace the inline Render/Viewport/Zoom controls box (lines 2585-2621) with a small icon button (e.g., `Settings2` or `SlidersHorizontal` icon)
- Clicking it opens a `Popover` containing the same three numeric inputs
- This frees ~250px of horizontal space in the top bar

**3. Persist view settings in localStorage**
- On mount, read `renderWidth`, `viewportWidth`, `screenZoom` from `localStorage` with defaults of 470, 470, 100
- On change, write back to localStorage
- Key: `campaign-editor-view-settings`

### Layout after change (left → right)
```text
[←] [Campaign Name] [status] [★] [👁] | [Original] [Creative] [Conservative] [Save as New] | ... | [Undo][Redo] [⚙] [Export] [Review]
```

### Technical details
- Use `Popover` from `@/components/ui/popover` for the collapsible zoom controls
- Import `SlidersHorizontal` from lucide-react for the trigger icon
- localStorage key: `campaign-editor-view-settings`, stored as JSON `{renderWidth, viewportWidth, screenZoom}`

