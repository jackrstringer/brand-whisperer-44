

# Fix: Remove `index` field from Anthropic image blocks

## Problem

Line 217 in `generate-campaign/index.ts` adds an `index` property to each image block object:
```typescript
return { index, type: "image", source: { ... } };
```

Anthropic's API rejects this with: `"messages.0.content.1.image.index: Extra inputs are not permitted"`. The API only accepts `type` and `source` on image content blocks.

## Fix

In `supabase/functions/generate-campaign/index.ts`, line 217:
- Remove the `index` property from the returned object
- The images are already pushed in order via `Promise.all` preserving insertion order, so `index` is unnecessary

Change line 217 from:
```typescript
return { index, type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: b64 } };
```
to:
```typescript
return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: b64 } };
```

Also remove the unused `index` parameter from the `.map()` callback on line 209 (cosmetic cleanup).

Single file change, single line fix. Redeploy the edge function after.

