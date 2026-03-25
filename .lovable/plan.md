

# Fix Klaviyo Campaign Creation — Invalid `send-strategy` Field

## Problem
The Klaviyo API (v2024-10-15) rejects `send-strategy` as a campaign attribute. The correct field name uses underscores: `send_strategy`, with nested `options_static`.

## Change

### `supabase/functions/klaviyo-proxy/index.ts` (lines 192-195)
Replace the hyphenated keys with underscored versions:

```typescript
// Before:
"send-strategy": {
  method: "static",
  "options-static": { datetime: null },
},

// After:
send_strategy: {
  method: "static",
  options_static: { datetime: null },
},
```

Single file, 4-line change.

