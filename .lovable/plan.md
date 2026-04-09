

## Problem

In flow mode, the campaign HTML contains Liquid templates (e.g. `{{ event.extra.line_items[0].name }}`). When a preview event is selected, the `klaviyo-render-preview` edge function resolves these templates into actual values and the result is displayed in the iframe. Two critical issues:

1. **Editing destroys Liquid templates**: When the user clicks into any text element, the iframe's `contentEditable` + `syncHtml()` mechanism serializes the *rendered* DOM (with resolved values) and sends it back via `textEdited`. This overwrites `campaign.html` with the baked-in values, permanently losing the Liquid templates. After that, switching preview events has no effect — the templates are gone.

2. **No formatting propagation**: If a user changes font size on a product title, it only affects that one DOM element, not all instances of the same Liquid field (e.g., all `{{ item.name }}` inside a `{% for %}` loop).

## Solution

### 1. Protect dynamic content from text editing (iframe script changes)

In the iframe's initialization script (the giant inline `<script>` block in `srcdocHtml`):

- **Before** setting `contentEditable` on elements, check if the element's text was produced by a Liquid variable. The `klaviyo-render-preview` function will be updated to wrap rendered dynamic content in a marker: `<span data-liquid="event.extra.line_items[0].name">Actual Value</span>`.
- Elements (or ancestors) with `data-liquid` attributes get `contentEditable = false` — users can click them but cannot type/delete text.
- The floating toolbar (ftb) still appears for these elements, but with the **Ideate** button hidden and text input disabled. Font size, color, alignment, bold/italic/underline, and padding controls remain functional.

### 2. Apply formatting to the source HTML, not the rendered preview

When a formatting change is made on a `data-liquid` element:

- Instead of calling `syncHtml()` (which would bake rendered values into `campaign.html`), the iframe sends a **new message type**: `{ type: 'flowStyleEdit', liquidPath: 'item.name', property: 'fontSize', value: '14px' }`.
- The parent handler in `CampaignEditor.tsx` receives this message and applies the style change to the **source Liquid HTML** (`campaign.html`), finding all elements that contain the matching `{{ liquid_path }}` pattern and adding/updating the inline style.
- The updated source HTML is saved to the database, and the preview is re-rendered with the current event data.

### 3. Update `klaviyo-render-preview` to mark dynamic content

Modify the edge function to wrap rendered Liquid output with `data-liquid` markers so the iframe can identify which elements contain dynamic content. This is done by preprocessing the HTML before Liquid rendering:

- Find `{{ variable }}` patterns and wrap them: `<span data-liquid="variable">{{ variable }}</span>`
- For `{% for item in event.extra.line_items %}` blocks, add `data-liquid-loop="event.extra.line_items"` to the loop container.

### 4. Prevent `textEdited` saves during flow preview mode

In the `textEdited` handler in `CampaignEditor.tsx` (line ~1812):

- If `flowPreviewHtml` is set (meaning we're viewing a rendered preview), **skip** saving the serialized HTML back to `campaign.html`. The rendered preview is display-only; only explicit style edits (via the new `flowStyleEdit` message) should modify the source.

## Files to modify

1. **`supabase/functions/klaviyo-render-preview/index.ts`** — Add `data-liquid` marker injection before Liquid rendering
2. **`src/pages/CampaignEditor.tsx`** — Three changes:
   - Iframe inline script: skip `contentEditable` for `data-liquid` elements, send `flowStyleEdit` messages for formatting, disable text input on dynamic fields
   - `textEdited` handler: skip save when `flowPreviewHtml` is active
   - New `flowStyleEdit` handler: apply style changes to source HTML and re-render preview
3. **No database changes needed**

## Complexity notes

- The `{% for %}` loop case is the trickiest — the source HTML has one template but renders N items. The marker approach handles this by tagging each rendered item with `data-liquid="item.name"` (the loop variable path), so a style change to any one propagates to the template in the source HTML.
- Static text elements remain fully editable as before — this only restricts elements containing resolved Liquid variables.

