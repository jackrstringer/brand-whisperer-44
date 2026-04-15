

## Expand Flow Trigger to All Klaviyo Metrics

### What Changes
Currently, `klaviyo-fetch-schema` filters metrics to only 9 hardcoded transactional names (Checkout Started, Placed Order, etc.). The UI renders them as stacked buttons. This limits users to a small subset.

The change opens this up to **every metric** in the Klaviyo account, displayed in a **searchable combobox** with **integration source icons** (Shopify, Recharge, Klaviyo, custom, etc.).

### How It Works

**1. Edge function (`klaviyo-fetch-schema/index.ts`)**
- Remove the filter that only keeps known transactional metric names
- Return ALL metrics from the Klaviyo API, paginating if needed
- Extract the `integration` object from each metric (`attributes.integration.name` and `attributes.integration.object`) to pass source info to the frontend
- Keep the priority sorting for known metrics (they float to top), but append all others alphabetically below
- Still fetch sample event data for the selected metric on-demand (not for all — too many API calls). Add a new optional param `fetchEventFor` so the client can request sample data for a specific metric after selection

**2. Frontend (`FlowConfigPanel.tsx`)**
- Replace the button list with a **Popover + Command** (cmdk) searchable combobox
- Each item shows: integration icon, metric name, green dot if has real data
- Integration icons mapped from `integration.name`:
  - `shopify` → ShoppingCart icon
  - `recharge` → RefreshCw icon  
  - `klaviyo` → Mail icon (or a K badge)
  - `api` / custom → Webhook/Zap icon
  - Default → CircleDot icon
- Known transactional metrics get a "Recommended" badge and sort first
- On selection, fire a second call to fetch sample event data for that specific metric (lazy loading), then update `flowConfig`
- Show the selected metric in the trigger with its icon and a change button

### Files

| File | Action |
|------|--------|
| `supabase/functions/klaviyo-fetch-schema/index.ts` | Edit: return all metrics with integration source, add lazy event fetch mode |
| `src/components/campaign/FlowConfigPanel.tsx` | Edit: replace button list with searchable combobox + icons |

### Technical Details

**Metric shape from Klaviyo API:**
```json
{
  "id": "abc123",
  "attributes": {
    "name": "Placed Order",
    "integration": {
      "id": "...",
      "name": "Shopify",
      "category": "ecommerce",
      "object": "order"
    }
  }
}
```

**New response shape from edge function:**
```typescript
{
  connected: true,
  metrics: [
    { metric_id, metric_name, description, integration_name, integration_category, priority, is_recommended, has_real_data }
  ],
  synced_at, account_name
}
```

**Lazy event fetch:** When user selects a metric, client calls `klaviyo-fetch-schema` with `{ brandId, fetchEventFor: metric_id }` — returns `{ sample_payload, liquid_variables }` for just that one metric. This avoids fetching events for 50+ metrics upfront.

