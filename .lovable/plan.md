

# Redesign: Inspiration Panel for Campaign Creation Only

## Current State

The reference panel is a 280px collapsible left sidebar that shows at all times (draft + editing). It uses small 180px thumbnail cards with labels. After generation, there's no way to "star" the campaign.

## What the User Wants

1. **Inspiration panel only during campaign creation** (draft state, before HTML exists)
2. **Takes the entire left panel** — since there's no campaign preview to show yet, the left panel (currently showing "Generate a campaign to see the preview") becomes the inspiration browser
3. **Full-length campaign renders** — no labels, just visual previews rendered like the main campaign preview (iframe-style), sized at ~470×470px equivalent at 55% zoom, 3 columns wide
4. **After generation** — panel disappears, replaced by the campaign preview. A "star" button appears in the top bar (left of the render controls) to save the generated campaign as a reference/favorite

## Changes

### 1. `CampaignEditor.tsx` — Layout restructure

**Draft state (no HTML yet):**
- Remove the `ReferencePanel` sidebar entirely from the left
- The left panel (inside `PanelGroup`) becomes the inspiration browser instead of showing "Generate a campaign to see the preview"
- Show a scrollable 3-wide grid of reference campaigns, each rendered as a scaled-down iframe or full-length image preview (~258px wide at 55% zoom of 470px)
- No labels, no brand names — pure visual thumbnails showing the full campaign length
- Clicking a campaign selects it as reference (highlighted border + strength slider appears at bottom)
- Keep the right panel as the campaign brief form

**After generation (HTML exists):**
- Left panel shows the campaign preview as it does now
- No inspiration panel visible
- Add a star/heart button in the top bar, to the left of the "Render:" controls
- Clicking it saves the current campaign to `saved_references` as type "campaign"
- Filled star = already saved, empty = not saved

### 2. `ReferencePanel.tsx` — Repurpose as inline component

- Convert from a sidebar into an inline component that fills the left panel
- Remove the collapsed strip / 280px sidebar behavior
- Display reference campaigns in a 3-column grid
- Each campaign shown as a full-length image (using `thumbnail_url` or first `image_url`), `object-fit: cover` with `object-position: top`, filling the card width
- No text labels — visuals only
- On hover: subtle overlay with "Use as reference" button
- Keep the tabs (Library / My Campaigns / Saved) as filter options at top
- When a reference is selected, show the strength slider as a sticky bar at the bottom

### 3. Top bar star button

- Add a `Star` icon button between the campaign name/badge and the render controls
- Only visible when `campaign.html` exists (post-generation)
- Toggle saves/unsaves to `saved_references` with `reference_type: "campaign"`
- Optimistic UI update with toast feedback

## Files Modified

| File | Change |
|------|--------|
| `src/pages/CampaignEditor.tsx` | Replace left panel content in draft state with inspiration grid; add star button to top bar post-generation; remove sidebar `ReferencePanel` |
| `src/components/campaign/ReferencePanel.tsx` | Redesign as full-panel inline component: 3-col visual-only grid, no labels, tabs at top, strength slider at bottom |

