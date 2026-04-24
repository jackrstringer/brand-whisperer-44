
Build a two-step Flow Mode experience that separates “understand the business logic” from “inspect/edit generated emails.”

## Goal

The first screen should be a very minimal flow skeleton review:

```text
Trigger
  ↓
Message: Welcome + offer
  ↓
Delay: 24h
  ↓
Message: Education / objection handling
  ↓
Split: Purchased?
     YES → Exit
     NO  → Message: Last chance
```

No campaign thumbnails, no subject lines, no preview text, no section lists, no dense metadata, no generated email preview panels. The point is instant skimmability.

After the user approves the skeleton, the app moves into the existing detailed workspace where generation, previews, message details, chat, and campaign HTML inspection belong.

## Implementation plan

### 1. Add an explicit “Skeleton Review” mode

Update `FlowBuilderPage.tsx` so flow pages choose between two modes:

- `skeleton_review`
  - Used when `flow.status === "skeleton_ready"`.
  - Shows only the clean, minimal skeleton canvas.
  - Shows a prominent approve action.
- `detail_workspace`
  - Used after approval/generation starts or when the flow is already `generating` / `complete`.
  - Shows the current split-pane workspace with chat, detailed nodes, previews, generation controls, etc.

Behavior:

- Newly drafted skeletons open in review mode.
- Existing generated/complete flows open in detailed mode.
- Approving the skeleton starts generation and transitions into detailed mode.
- No database schema changes are required; this can use the existing `flows.status` lifecycle.

### 2. Create a minimal skeleton canvas variant

Update `SkeletonViewer.tsx` to support a presentation mode prop, for example:

```ts
mode?: "review" | "detail"
```

In `review` mode:

- Render the same flow graph and edge layout.
- Use simplified node components.
- Disable or hide:
  - campaign thumbnails
  - bottom-half campaign preview behavior
  - subject line / preview text display
  - generation buttons on individual nodes
  - delete buttons
  - sticky notes
  - node palette
  - minimap
  - detailed flyouts
  - complex message metadata
- Keep:
  - pan / zoom
  - fit-to-view
  - basic YES / NO path labels
  - compact flow structure

This keeps the visual model consistent while removing the information overload.

### 3. Redesign review-mode nodes around hierarchy

In review mode, each node should show only one primary idea.

#### Trigger node

Show:

- small label: `TRIGGER`
- trigger name, e.g. `Added to List`

Do not show “Source” rows or metadata tables.

#### Message node

Show:

- step number, e.g. `01`
- message title, e.g. `Welcome + offer delivery`
- optional one-line purpose, derived from `job`, e.g. `Deliver offer and introduce hero product`

Do not show:

- thumbnail
- subject direction
- preview text
- status pill unless generating has already started
- sections
- notes
- action icons

#### Delay node

Show only:

- clock icon or tiny label
- delay value, e.g. `24h`, `2 days`

No card body, no “wait” label unless it is visually tiny and secondary.

#### Split node

Show only:

- label: `SPLIT`
- condition, e.g. `Purchased?`

Do not show:

- YES/NO descriptions inside the node
- branch breakdown text
- “Branches not specified”
- long notes

YES/NO should remain on the connecting paths only.

#### Exit node

Show as a small terminal chip:

- `Exit`

### 4. Make the skeleton look like a map, not a dashboard

Update `src/index.css` with review-mode-specific classes, for example:

```css
.flowline-root.review-mode ...
```

Visual direction:

- fewer borders
- lighter surfaces
- more whitespace between nodes
- stronger typographic hierarchy
- smaller utility labels
- nodes sized for readability, not metadata storage
- muted secondary text
- no heavy hover shadows
- no thumbnail blocks
- no dense rows

The review canvas should feel closer to a process diagram / subway map than a CRM card UI.

### 5. Tighten the layout for skimmability

Adjust layout constants when in review mode:

- message nodes can be wider but shorter
- delay nodes should be very small
- split nodes should be compact
- vertical spacing should make the sequence readable
- branch spacing should make YES/NO paths immediately understandable

The review-mode graph should fit comfortably in the available canvas at the user’s current viewport size.

### 6. Add a review screen header / approval bar

In `FlowBuilderPage.tsx`, when in review mode, replace the current dense top-right actions with a focused approval bar:

- title: `Review flow skeleton`
- helper text: `Approve this structure before generating the full messages.`
- primary button: `Approve & Generate`
- secondary affordance: `Edit with Lucy` or `Refine skeleton` if the existing `FlowAgentChat` should remain reachable

Keep this header minimal and floating, matching the existing pill-style top bar.

### 7. Keep editing/refinement available without overwhelming the canvas

In review mode, avoid showing the full right-side chat by default.

Instead:

- either hide the split pane entirely and use a full-width skeleton review canvas
- or expose a small `Refine` / `Edit with Lucy` button that opens the existing `FlowAgentChat` as a side panel only when needed

This keeps the default review screen focused on flow comprehension.

### 8. Preserve the detailed workspace for after approval

The existing complex view should not be deleted. It should become the second step.

In detail mode, keep the current capabilities:

- generated message previews
- campaign thumbnail / iframe preview behavior
- detail flyouts
- chat panel
- individual regenerate controls
- export all
- full metadata inspection

But these should not appear on the initial approval screen.

### 9. Update generation transition behavior

Change the approve button flow:

1. User reviews minimal skeleton.
2. User clicks `Approve & Generate`.
3. App sets flow status to `generating`.
4. App transitions to detailed workspace.
5. Existing `generateAllEmails()` runs sequentially.
6. When complete, status becomes `complete`.

This uses the existing generation logic but moves it behind a cleaner approval step.

### 10. Improve skeleton prompt output to support skimmability

Update the `flow-agent` skeleton prompt so generated skeleton labels are intentionally short:

- Email labels: 2–5 words
- Jobs: one short purpose sentence
- Delay labels: compact values like `24h`, `2 days`
- Split labels: question format like `Purchased?`, `VIP customer?`
- Avoid long labels in bracket headers

This prevents the minimal canvas from becoming overloaded at the source.

## Files to update

### `src/pages/FlowBuilderPage.tsx`

- Add view-mode selection.
- Render review mode for `skeleton_ready`.
- Render detail workspace after approval/generation.
- Move approve/generate action into a focused review header.
- Keep existing detailed workspace for generated flows.

### `src/components/flows/SkeletonViewer.tsx`

- Add `mode="review" | "detail"`.
- Add simplified review node renderer.
- Hide thumbnails, previews, detail flyouts, palette, minimap, sticky tools, and node action controls in review mode.
- Use review-specific sizing/layout constants.
- Keep YES/NO path labels.

### `src/index.css`

- Add review-mode flow canvas styling.
- Reduce visual weight and density.
- Create compact node styles for trigger, message, delay, split, and exit nodes.
- Preserve existing detailed styles for the full workspace.

### `supabase/functions/flow-agent/index.ts`

- Tighten the skeleton generation prompt so labels and purposes are short enough for a diagram-first UI.

## Expected result

- The initial flow screen becomes instantly skimmable.
- The user sees the business process first, not email rendering details.
- Message nodes show only title/purpose.
- Delay and split nodes are compact and obvious.
- YES/NO branching is visible only on paths.
- The detailed, information-heavy workspace still exists, but only after approval.
- The screen finally communicates “what is the structure of this flow?” before asking the user to deal with generated campaign complexity.
