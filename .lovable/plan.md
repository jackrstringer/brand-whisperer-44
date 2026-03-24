

# Campaign Generation Performance Audit -- 7 Fixes

## Overview

Seven targeted fixes across three files to eliminate timeouts, reduce latency, and improve reliability. No prompt content, creative direction, or model selection changes.

## Fix 1: Increase max_tokens

**Files**: `generate-campaign/index.ts`, `edit-campaign/index.ts`

- `generate-campaign` Pass 1 (line 397): `8192` to `16384`
- `generate-campaign` retry (line 428): `8192` to `16384`
- `generate-campaign` QA pass (line 464): `8192` to `4096` (JSON patch output is much smaller)
- `edit-campaign` (line 181): `8192` to `16384`

## Fix 2: Parallelize DB queries

**`generate-campaign/index.ts`** (lines 162-186): The brand_profiles and brands queries are independent reads. Run them in parallel, then chain user_preferences after brands resolves:

```typescript
await supabase.from("campaigns").update({ status: "generating" }).eq("id", campaignId);

const [profileResult, brandResult] = await Promise.all([
  supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
  supabase.from("brands").select("user_id").eq("id", brandId).single(),
]);
// then user_preferences chained after brandResult
```

**`edit-campaign/index.ts`** (lines 28-53): campaign, brand_profiles, brand_assets, and product_assets can be partially parallelized. Campaign must be fetched first (need brand_id), then the rest run in parallel.

## Fix 3: Cap reference images

**`generate-campaign/index.ts`** line 205: Change normal mode cap from `10` to `5`.

```typescript
const maxRefs = speedMode === "faster" ? 3 : 5; // was 10 for normal
```

## Fix 4: Chunked base64 encoding

**Both files**: Replace all `btoa(String.fromCharCode(...new Uint8Array(buf)))` with a chunked function to avoid stack overflow on large images.

```typescript
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
```

- `generate-campaign` line 216: replace `btoa(String.fromCharCode(...new Uint8Array(buf)))` with `arrayBufferToBase64(buf)`
- `edit-campaign` line 90: same replacement

## Fix 5: Skip rehosting for already-hosted URLs

**`_shared/imagekit.ts`** `rehostHtmlImagesWithImageKit()` line 218: Already skips `ik.imagekit.io`. Add Supabase storage skip:

```typescript
if (/^https:\/\/ik\.imagekit\.io\//i.test(normalizedSource)) continue;
if (/\.supabase\.co\/storage/i.test(normalizedSource)) continue;
```

**`edit-campaign/index.ts`** lines 55-96: The entire reference image rehosting block fetches images, uploads to ImageKit, extracts new URLs, then fetches again for base64. Replace with: check if URL is already permanent, skip rehost, fetch once for base64 only.

**`edit-campaign/index.ts`** lines 196-200: The `rehostHtmlImagesWithImageKit` call on output HTML will now naturally skip permanent URLs thanks to the shared function fix.

## Fix 6: AbortController timeout on Anthropic calls

**Both files**: Add a `callAnthropic` helper with 120s timeout. On timeout, set campaign status to "error" with message "Generation timed out. Please try again with Fast mode."

```typescript
async function callAnthropic(body: object, apiKey: string, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Anthropic API call timed out after ${timeoutMs/1000}s`);
    throw error;
  } finally { clearTimeout(timeout); }
}
```

Replace all 4 `fetch("https://api.anthropic.com/...")` calls (3 in generate, 1 in edit) with `callAnthropic(...)`.

## Fix 7: QA pass returns JSON patch instead of full HTML

**`generate-campaign/index.ts`**: Replace the `QA_SYSTEM_PROMPT` (lines 108-133) with a new prompt requesting JSON output:

```
You are an email QA auditor. Return ONLY a JSON response:
{
  "passes_qa": true/false,
  "issues": [{ "description": "...", "find": "exact substring", "replace": "corrected substring" }]
}
```

The 8 check items from the instructions. QA `max_tokens` set to `4096`.

**Response handler** (lines 467-484): Replace full-HTML acceptance with JSON parse + string patch application:

```typescript
const qaText = qaResult.content[0].text.trim();
let qaData;
try { qaData = JSON.parse(qaText); } catch { qaData = { passes_qa: true, issues: [] }; }

let finalHtml = html;
if (!qaData.passes_qa && qaData.issues?.length > 0) {
  for (const issue of qaData.issues) {
    if (issue.find && issue.replace && finalHtml.includes(issue.find)) {
      finalHtml = finalHtml.replace(issue.find, issue.replace);
    }
  }
}
// Validate patched HTML still passes completeness + product checks, else keep original
```

## Files changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-campaign/index.ts` | Fixes 1-4, 6-7 |
| `supabase/functions/edit-campaign/index.ts` | Fixes 1-2, 4-6 |
| `supabase/functions/_shared/imagekit.ts` | Fix 5 (add Supabase storage skip) |

