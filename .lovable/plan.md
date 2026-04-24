
Implement the skeleton review UI to match the provided layouts: bare-bones by default, expandable message nodes on hover/click, and AI-generated short block labels.

## What will change

### 1. Replace current review nodes with the provided “pill skeleton” visual system

The default skeleton review will become extremely minimal:

- Trigger: dark rounded pill with icon + `Trigger | Subscribed to Email Marketing`
- Message nodes: long white rounded pills with only:
  - message number/day marker
  - separator
  - message title
- Delay nodes: small dark capsules like `24H`, `2D`
- Conditional split: dark rounded pill with icon + `Conditional Split | New Customers vs Repeat Customers`
- Branches: clean black connector lines with simple YES/NO route labels only
- Exit nodes: small terminal/exit chips if needed

Default message nodes will not show purpose, subject direction, sections, preview text, thumbnails, status rows, metadata, or generated previews.

### 2. Add hover expansion for message nodes

Message nodes in review mode will smoothly expand into the richer state from the second reference image.

Collapsed state:

```text
2 | Welcome to our Brand
```

Expanded state:

```text
2
Day 2

Welcome to our Brand
Brief purpose/goal sentence.

SL Subject direction / subject line
PT Preview text / preview direction

[Welcome Hero] [Dynamic Discount] [Categories Highlight]
[Social Proof] [Categories Highlight]
```

Expansion behavior:

- Hovering a message node expands it.
- The expansion uses a smooth “blobby”/spring-like transition:
  - rounded pill grows into a large rounded card
  - opacity fade-in for details
  - slight scale/shape easing
- The expansion stays fast and responsive.
- Details collapse when hover leaves unless the node has been locked open.

### 3. Add click-to-lock behavior

For review-mode message nodes:

- Click once: lock expanded.
- Click again: unlock it.
- If unlocked, it returns to hover-only behavior.
- Only one node should be locked open at a time unless there is a strong existing reason to allow multiple.
- Drag/pan behavior will be protected so click-to-lock does not conflict with canvas panning.

### 4. Add a “show full detail” toggle

Add a compact review control near the orientation toggle:

- `Compact`
- `Full detail`

Behavior:

- `Compact`: default; nodes are bare-bones unless hovered/locked.
- `Full detail`: all message nodes render in the expanded card style so the user can inspect the skeleton without hovering node-by-node.
- This toggle applies only to skeleton review mode, not the detailed generation workspace.

### 5. Match the provided layouts closely

Review mode styling will be rewritten around the uploaded references:

- White/cream canvas.
- Thin black connector lines.
- Large rounded message pills.
- Dark trigger/split/delay capsules.
- High-contrast monochrome hierarchy.
- Minimal borders and no dashboard-card styling.
- Efficient spacing so more layers fit on screen.
- Vertical and horizontal orientation both remain available, but both use the same minimal visual language.

For horizontal mode, the same components will lay left-to-right while preserving dense spacing and readable branching.

### 6. Condense structure block labels

The expanded node must show short block chips like:

```text
Welcome Hero
Dynamic Discount
Categories Highlight
Social Proof
```

Instead of long section descriptions.

Implementation:

- Add a section-label condensing helper in the frontend that turns verbose section bullets into short chip labels.
- Examples:
  - `Hero block — introduce the offer and product benefit` → `Hero`
  - `Proof element — dentist endorsement/social proof` → `Proof`
  - `CTA — destination to collection/product page` → `CTA`
  - `Product education block — explain key benefits` → `Education`
- Preserve the original detailed section text in the underlying skeleton data; only the review display becomes condensed.

### 7. Tighten the AI skeleton prompt so future skeletons produce short display-ready blocks

Update the flow-agent prompt rules so generated skeletons include compact section names.

Prompt requirements to add:

- Email labels: 2–5 words.
- Job/purpose: one short sentence.
- Subject direction: short angle, not copy.
- Section bullets must begin with a 1–3 word block label, followed by optional short explanation.
- Preferred section-label examples:
  - `Welcome Hero`
  - `Offer Reveal`
  - `Product Proof`
  - `Social Proof`
  - `Founder Note`
  - `Dynamic Discount`
  - `Categories Highlight`
  - `Objection Handle`
  - `Last Chance CTA`
- No long marketing-copy-style section names.

### 8. Update review layout geometry for visual efficiency

In `SkeletonViewer.tsx`, review-mode node sizing/layout will be adjusted:

- Collapsed message pills become wide and short.
- Expanded nodes use the large rounded-card dimensions from the mockup.
- Delay nodes become small connector capsules.
- Split nodes become compact dark capsules.
- Branch gaps are reduced while still preventing overlap.
- Fit-to-view accounts for expanded locked/full-detail nodes so open cards do not overlap or get clipped.

### 9. Preserve the detailed workspace

The detailed workspace after approval stays separate.

Review mode:

- process skeleton
- hover/click expanded skeleton cards
- no campaign thumbnails/previews
- no generated email iframe panel
- no dense metadata

Detail mode:

- generation controls
- generated campaign previews
- subject line/preview text from generated campaigns
- full message inspection
- chat/refinement tooling

## Files to update

### `src/components/flows/SkeletonViewer.tsx`

- Add review-mode hover/locked expansion state.
- Add full-detail toggle state.
- Replace `ReviewNodeView` with collapsed/expanded variants matching the provided layouts.
- Add condensed section-chip display.
- Adjust review geometry to support collapsed and expanded dimensions.
- Keep vertical/horizontal orientation toggle.
- Ensure connector routing still works with compact pills and expanded cards.

### `src/index.css`

- Rewrite review-mode node styling:
  - dark trigger/split/delay pills
  - white message pills
  - expanded rounded cards
  - smooth spring-like expansion transitions
  - condensed chip styling
  - efficient connector styling
- Add styling for the full-detail toggle.

### `supabase/functions/flow-agent/index.ts`

- Tighten prompt instructions for short section/block labels.
- Make future skeletons output display-ready condensed block names while preserving strategic usefulness.

## Expected result

- The skeleton review looks like the uploaded bare-bones process map.
- Default view is instantly skimmable: titles, delays, routes, splits only.
- Hovering a message smoothly expands it into the richer mockup-style card.
- Clicking locks a message open; clicking again unlocks it.
- A toggle lets the user show every message in full-detail mode.
- Structure block chips are short and readable.
- The user can understand the whole flow at a glance before approving generation.
