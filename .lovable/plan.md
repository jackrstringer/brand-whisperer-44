

# Figma + Website Extraction Pipeline — Confirmed Properties Before AI Audit

## Problem
The AI guesses font names, hex colors, and button properties from compressed JPEG screenshots. It's bad at this. Figma and website CSS can provide these values deterministically.

## What Changes

### 1. UI — New inputs on Source Quiz + Brand Setup

**SourceQuiz.tsx** — Add two new source options:
- `"figma"` — "Figma File URL" with description "Exact font names, colors, and spacing -- no guessing." Shows two inputs when selected: Figma URL field + Figma Personal Access Token field (type=password, with help link)
- `"website"` source already exists but only captures URL — keep as-is

**BrandSetup.tsx** — Add state for `figmaUrl`, `figmaToken`. Pass to SourceQuiz. Store `figmaUrl` on the brand record (the `website_url` column already exists). Token goes to the edge function only, never stored in DB.

### 2. New Edge Function: `extract-figma`

**Input**: `{ figma_url, figma_token }`

**Logic**:
1. Parse file key + optional node ID from URL
2. Call Figma REST API `GET /v1/files/{key}` (or `/v1/files/{key}/nodes?ids={id}`)
3. Recursively traverse document tree:
   - Collect all text nodes → extract `fontFamily`, `fontWeight`, `fontSize`, `italic`, `lineHeightPx`, `letterSpacing`, text content
   - Collect all SOLID fills → convert `{r,g,b}` floats to hex
   - Collect `cornerRadius`, auto-layout padding/spacing
4. Deduplicate and categorize by usage (large text = heading, small = body)
5. Return `confirmed_properties` JSON

**Output**: `{ confirmed_properties: { fonts, colors, buttons, spacing }, source: "figma", raw_text_nodes_sample: [...] }`

### 3. New Edge Function: `extract-website-fonts`

**Input**: `{ url }`

**Logic**:
1. Fetch HTML
2. Parse `<link>` tags for Google Fonts URLs → extract family names directly from URL params
3. Parse `<style>` blocks and linked stylesheets for `font-family`, `color`, `background-color`, CSS custom properties
4. Deduplicate

**Output**: `{ confirmed_properties: { fonts_from_css, google_fonts_detected, colors_from_css, css_variables }, source: "website" }`

### 4. Update `audit-brand` Edge Function

Accept optional `confirmed_properties` parameter. When present, prepend to the per-campaign audit prompt:

```
CONFIRMED PROPERTIES (exact -- do not override):
Fonts: Headline: Playfair Display, Body: DM Sans
Colors: #D2E823, #FFFFFF, #333333, #000000
Buttons: border-radius 999px, font-weight 700, font-style normal

Focus on: layout patterns, voice/tone, emphasis patterns, photography style, component structures. Do NOT guess at font names or hex colors.
```

When absent, add the existing italic CTA warning.

### 5. Update `BrandSetup.tsx` Orchestration

On "Analyze Brand" click:
1. **Parallel extraction** (before audit):
   - If Figma URL provided → call `extract-figma`
   - If website URL provided → call `extract-website-fonts`
   - Always → slice images (existing)
2. **Merge** confirmed properties (Figma wins over website for conflicts)
3. **Call `audit-brand`** with sliced images + merged `confirmed_properties`
4. Continue to spec + guide generation as before

### 6. Database Migration

Add to `brand_profiles`:
- `confirmed_properties` (jsonb, nullable) — merged extraction from Figma/website
- `extraction_sources` (text[], nullable) — e.g. `["figma", "website", "screenshots"]`

The `website_url` column already exists on `brands`. Add `figma_url` (text, nullable) to `brands`.

### 7. Pass confirmed_properties to extract-brand

Update `extract-brand` spec prompt to use confirmed properties when available, so the system prompt and extraction JSON use exact font names and colors instead of AI guesses.

---

## Files

1. **`src/components/brand/SourceQuiz.tsx`** — Add "figma" source type with URL + token inputs
2. **`src/pages/BrandSetup.tsx`** — Add figmaUrl/figmaToken state, parallel extraction calls before audit, merge logic
3. **`supabase/functions/extract-figma/index.ts`** — New: Figma REST API extraction
4. **`supabase/functions/extract-website-fonts/index.ts`** — New: CSS/Google Fonts extraction
5. **`supabase/functions/audit-brand/index.ts`** — Accept + inject confirmed_properties into prompts
6. **`supabase/functions/extract-brand/index.ts`** — Pass confirmed_properties to spec generation
7. **Database migration** — Add `confirmed_properties`, `extraction_sources` to brand_profiles; add `figma_url` to brands

## Not Changed
- HTML guide template structure
- Image slicing logic
- Fire-and-forget pattern
- Campaign generation flow

