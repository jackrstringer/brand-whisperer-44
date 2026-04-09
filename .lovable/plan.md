

## Plan: Copy Liquid Syntax Instead of Values + Full Field Browser

### Problem
1. **Copy copies values, not Liquid syntax** — clicking copy on "Order #30758" copies `30758` instead of `{{ event.extra.order_number }}`. Users need the Liquid path to paste into the AI chat or use in templates.
2. **Only "known" fields are shown** — the viewer cherry-picks specific fields. Users need to browse ALL fields in the event payload and grab any Liquid path they want.
3. **No "Include this" action** — users should be able to click a field and send it to the AI chat as an instruction.

### Changes

#### 1. Refactor `EventDataViewer` — every field shows its Liquid path

**File**: `src/components/campaign/EventDataViewer.tsx`

- Add a `liquidPath` prop to `KVRow` (e.g., `event.extra.order_number`). The copy button copies `{{ liquidPath }}` instead of the raw value.
- Show the Liquid path as a subtle monospace label below the value on hover or always visible.
- Add a second action button: "Insert" (or a small + icon) that calls an `onInsertField(liquidPath)` callback passed down from the parent. This will be used to send a message like "Include {{ event.extra.order_number }} in the email" to the AI chat.
- Update `LineItemCard` similarly — fields inside line items get paths like `event.extra.line_items[].name`, `event.extra.line_items[].price`, etc.

#### 2. Add "All Fields" section — recursive field browser

**File**: `src/components/campaign/EventDataViewer.tsx`

- Add a new collapsible section at the bottom: "All Available Fields".
- Recursively walk the entire `eventProperties` object (including `extra.*` nested objects/arrays).
- For each leaf value, display: the Liquid path, the current value (truncated), and a copy button that copies `{{ path }}`.
- For arrays (like `line_items`), show the path with `[]` notation and display the first item's fields as examples.
- This gives users full autonomy to discover and grab ANY field from the payload.

#### 3. Wire "Insert" action to parent

**File**: `src/components/campaign/FlowDetailsPanel.tsx`

- Pass an `onInsertField` callback to `EventDataViewer`.
- When clicked, it calls a new `onRequestInsert` prop that bubbles up to `CampaignEditor`, which can prepopulate the chat input with something like: `Include {{ event.extra.shipping_address.city }} in the email`.

**File**: `src/pages/CampaignEditor.tsx`

- Accept the `onRequestInsert` callback from `FlowDetailsPanel` and set the chat input value accordingly.

### UX Summary
- Every field row: shows value + Liquid path + two buttons: **Copy syntax** (copies `{{ path }}`), **Insert** (sends to chat)
- "All Available Fields" section at bottom recursively lists every field in the payload with its Liquid path
- Existing visual sections (Customer, Order, Items, Totals, etc.) remain but now copy syntax instead of values

