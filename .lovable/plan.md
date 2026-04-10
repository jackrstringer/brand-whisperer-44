

# Plan: Fix 5 Systemic Issues in Campaign Editor

## Issue 1: Chat edits don't visually update until page reload

**Root cause**: When `edit-campaign` returns an `html_patch` SSE event, the code updates `campaign.html` via `setCampaign`, but the preview HTML derivation chain (`baseHtml → displayHtml → htmlForPreview → srcdocHtml`) is blocked by `iframeOwnedHtmlRef.current`. Line 2778 shows that when `iframeOwnedHtmlRef.current` is truthy, `displayHtml` freezes to `lastStableHtmlRef.current`, ignoring the updated `campaign.html`.

The fix at line 1405 does `iframeOwnedHtmlRef.current = null`, which should work. But for flow campaigns, there's also `flowPreviewHtml` state that may be stale — the rendered preview cache isn't invalidated after an edit.

**Fix**:
- In the `html_patch` handler (line 1403), also clear `flowPreviewHtml` so the flow preview re-renders with the new HTML
- Ensure `lastStableHtmlRef.current` is updated to the new HTML when an `html_patch` arrives

## Issue 2: Product grid sizing is off

**Root cause**: The generated HTML uses `width="50%"` on product grid `<td>` elements (lines 123, 150, 187, 214, 251, 278 of the uploaded HTML). This violates the explicit rule "NEVER use percentage widths on grid <td> elements. Always use explicit pixel values." The `forceEqualGridColumns` post-processor in `finalizeCampaignHtml.ts` only processes grids detected by `isGridImageTd`, which checks for simple img or card-style tables. The product grid cards have nested tables with multiple rows (image + title + button), which may not be detected by `tdContainsCardTable` since it checks `trCount > 4` — each card has 3 `<tr>` elements inside, which passes, but the detection might still miss them because `imgCount > 2` could fail when there are sub-tables.

**Fix**:
- In `finalizeCampaignHtml.ts`, add a step that converts any `width="50%"` or `width="33%"` on grid `<td>` elements to explicit pixel values based on the 390px viewport
- Update `forceEqualGridColumns` to also handle percentage-width tds, not just pixel-width ones
- The generation prompt already says "NEVER use percentage widths" but Claude keeps using them, so the post-processor must enforce it

## Issue 3: AI aggressively adds dynamic content (names, pricing) not in the reference

**Root cause**: The flow system prompt at line 1012 explicitly says `Always include {{ person.first_name|default:'there' }} personalization`. This is a blanket instruction. Additionally, event data like `CompareAtPrice`, `Price`, and `Name` is dumped into the prompt (line 1257-1268), and there's no instruction telling the AI to only use dynamic fields that the reference actually showed.

**Fix**:
- Remove `Always include {{ person.first_name|default:'there' }} personalization` from the system prompt
- Replace with: "Only include dynamic personalization (first name, pricing, product details) if: (a) the reference email visually contains that element, or (b) the user explicitly requests it in their brief. Do NOT add dynamic fields that aren't present in the reference layout."
- Add specific guidance about pricing: "Only include pricing if the reference email shows pricing. Never include CompareAtPrice/sale pricing unless the reference explicitly shows a compare-at price pattern."

## Issue 4: Generated HTML can be wider than the preview iframe, causing horizontal scroll

**Root cause**: The iframe at line 4737 has `width: renderWidth` (390px) but no `overflow-x: hidden`. If the generated HTML has elements wider than 390px (e.g., images with `width="220"` inside padded containers), the iframe shows horizontal scrollbars.

**Fix**:
- In the injected `<style>` at line 2790, add `html,body{...overflow-x:hidden!important;max-width:100vw!important;}` to prevent any horizontal overflow inside the iframe
- In `finalizeCampaignHtml.ts`, add a new step that injects `<style>html,body{overflow-x:hidden;max-width:100%;}</style>` into the `<head>` of every generated email, so the content can never overflow horizontally regardless of where it's rendered
- This is a hard guardrail — even if the AI generates elements that are too wide, the overflow is hidden

## Issue 5: CompareAtPrice of $0.00 shown as a "sale from $0 to $99"

**Root cause**: Two problems:
1. In `klaviyo-fetch-products/index.ts` line 18, `CompareAtPrice` is listed as a fallback for the `price` field in `PROPERTY_MAP`. This means if `Price` is missing, it falls back to `CompareAtPrice` which could be $0.
2. The AI template generates a compare-at price section using `event.CompareAtPrice` without semantic validation. When the Klaviyo event has `CompareAtPrice: $0.00` and `Price: $99.00`, it renders as "~~$0.00~~ $99.00" which is nonsensical.

**Fix**:
- Remove `CompareAtPrice` from the `price` fallback chain in `PROPERTY_MAP` — it's not a price, it's a comparison price
- Add semantic validation in the flow generation prompt: "SEMANTIC PRICE VALIDATION: If CompareAtPrice is $0, $0.00, or less than the regular Price, treat it as invalid/absent — do not render a compare-at price section. A product cannot be 'on sale' from $0."
- Add a post-processing step in `finalizeCampaignHtml.ts` that detects `$0.00` strike-through pricing patterns and removes them
- Add to QA audit checklist: "PRICING SANITY: Flag any compare-at/original price that is $0, $0.00, or less than the sale price as a critical error."

## Files to modify

1. **`src/pages/CampaignEditor.tsx`** — Fix html_patch handler to clear flow preview state; add overflow-x:hidden to iframe injected CSS
2. **`supabase/functions/_shared/finalizeCampaignHtml.ts`** — Add overflow-x guardrail injection; add percentage-width-to-pixel conversion step; add $0 pricing strip
3. **`supabase/functions/_shared/generateCampaignCore.ts`** — Update flow system prompt to remove blanket personalization; add semantic price validation rules; add "reference-first" dynamic content rules; add pricing sanity to QA checklist
4. **`supabase/functions/klaviyo-fetch-products/index.ts`** — Remove `CompareAtPrice` from price fallback chain

