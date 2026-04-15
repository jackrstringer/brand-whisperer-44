

## Fix: Remove Invalid `include=integration` Parameter

### Root Cause
Line 129 of `klaviyo-fetch-schema/index.ts` passes `?include=integration` to the Klaviyo `/metrics` endpoint. The Klaviyo API does not support this parameter for metrics, returning a 400 error.

### Fix
1. **Remove `include=integration`** from the URL on line 129
2. **Remove the integration sideloading logic** (lines 140-144, 153-159) since we can't get integration data via `include`
3. **Extract integration info from `metric.attributes`** instead — Klaviyo metrics include an `integration` object directly in `attributes` (e.g. `attributes.integration.name`). Map this to the response shape the frontend expects.

### File
| File | Change |
|------|--------|
| `supabase/functions/klaviyo-fetch-schema/index.ts` | Remove `include=integration`, read integration from `metric.attributes.integration` instead |

