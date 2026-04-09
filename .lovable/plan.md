

## Plan: Fix Flow Email Liquid Syntax, Add Flow QA Pass, Fix Preview Switching

### Problem Summary

Three issues:

1. **`$extra` paths in generated HTML**: The `extractLiquidVars` function blindly walks the real Klaviyo event payload, which includes a `$extra` property containing the raw Shopify order data. This produces variable paths like `event.$extra.line_items`, `event.$extra.total_price` — which Klaviyo's Liquid engine cannot parse. The standard Klaviyo variables use the flattened top-level keys (`event.Items`, `event.OrderId`), not `$extra`.

2. **No flow/transactional QA check**: The existing `qa-campaign` function only checks links, images, spelling, and subject line length. It has no awareness of Liquid syntax validity or whether the variables used actually exist in the event schema.

3. **Preview event switching requires "Revert" first**: `renderPreview` sets `isPreviewActive = true` after the first selection, but clicking another event still works — the issue is that the `html` prop passed to `renderPreview` is the *original* template HTML, not the currently-displayed preview. This is correct. The real UX issue is that clicking another event should just work directly without needing to revert — which it already does functionally, but the UI makes it feel like you need to revert first because of the active preview banner placement.

---

### Changes

#### 1. Fix `extractLiquidVars` to filter out `$extra` and internal `$` properties

**File**: `supabase/functions/klaviyo-fetch-schema/index.ts`

- In `extractLiquidVars`, skip any key that starts with `$extra`, `$attribution`, or other internal Klaviyo `$`-prefixed keys (except `$value` and `$event_id` which are valid Liquid variables).
- This ensures the variable contract only contains paths that Klaviyo's Liquid engine actually supports.

#### 2. Enrich standard schemas with Shopify-accurate fields

**File**: `supabase/functions/klaviyo-fetch-schema/index.ts`

- Update the "Placed Order" standard schema to include shipping address, subtotal, tax, currency, and other commonly-used fields that Klaviyo actually supports (e.g., `event.Items[].Variant`, `event.ShippingAddress.FirstName`).
- These are the real Klaviyo-supported top-level properties, not the raw Shopify `$extra` data.

#### 3. Add flow-specific QA pass to `qa-campaign`

**File**: `supabase/functions/qa-campaign/index.ts`

- Accept optional `flowConfig` parameter (with `event_schema` and `liquid_variables`).
- When present, run an additional QA section:
  - **Variable validation**: Extract all `{{ event.* }}` and `{% for ... in event.* %}` references from the HTML. Flag any variable that doesn't exist in the `liquid_variables` allowlist.
  - **Liquid syntax check**: Flag common syntax errors — unclosed `{% for %}` without `{% endfor %}`, missing `| default:` filters, `$extra` usage, malformed tag patterns.
  - **Klaviyo best practice check**: Verify unsubscribe link presence for marketing flows, `person.first_name` personalization, proper `{% if %}` guards around optional blocks.
- Return results in a new `flow_validation` section of the QA response.

#### 4. Wire flow QA into the campaign editor

**File**: `src/pages/CampaignEditor.tsx`

- When triggering QA on a flow/transactional campaign, pass `flowConfig` (including `event_schema` and `liquid_variables`) to the `qa-campaign` edge function.
- Display flow validation results in the QA results panel alongside existing checks.

#### 5. Fix preview event switching UX

**File**: `src/components/campaign/FlowDetailsPanel.tsx`

- Remove the requirement to revert before selecting a new event. When clicking a different event, call `renderPreview` directly — it already uses the original `html` prop as the template source, so switching is safe.
- Move the "Previewing with real event data" banner inline with the event list rather than above it, so it doesn't create a visual barrier.
- Remove `setIsPreviewActive` gating — any event click should render immediately.

---

### Technical Details

**`$extra` filtering logic** (in `extractLiquidVars`):
```text
Skip keys matching: $extra, $attribution, $flow, $message, $variation
Allow keys matching: $value, $event_id
```

**Flow QA validation checks**:
- Extract all `{{ ... }}` variable paths from HTML
- Compare each against the `liquid_variables` allowlist
- Flag unknown variables as errors with the specific path
- Check for unclosed control flow tags
- Check all variables have `| default:` filters

**Preview switching fix**:
- `renderPreview` already accepts the event and uses the original `html` — just remove the visual/UX friction that makes it seem like revert is required first.

