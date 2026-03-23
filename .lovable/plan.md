

# Two-Pass Image Slicing Architecture for Brand Analysis & Campaign Generation

## The Problem

Currently, reference campaign images (often 600x4000px) are sent whole to Claude. Images over 1568px on any edge get auto-downscaled, destroying the fine detail needed for typography, spacing, and color analysis. A 600x4000 image becomes ~235x1568 — useless for extracting design rules.

The generation pass has the same issue: reference images sent for style matching are downscaled, so the AI can't actually see the design details it's supposed to replicate.

## Solution

### 1. Client-side image slicing (`BrandSetup.tsx`)

Replace the single `resizeAndConvert` function with a `sliceImage` function:

- Load the image at full resolution
- If height > 1400px, slice into segments of ~1300px tall (keeping width at original, capped at 600px)
- Each slice becomes its own base64 JPEG
- Label each slice: `{ data, mediaType, campaignIndex, sliceIndex, totalSlices }`
- A 600x4000 image → 3 slices of 600x1333

For images that are normal aspect ratio (not tall emails), just cap at 1500px max dimension — no slicing needed.

Send the sliced array to `extract-brand` with metadata so the AI knows which slices belong together.

### 2. Two-pass extraction (`extract-brand/index.ts`)

**Pass 1 — Per-campaign analysis:**
- Group slices by `campaignIndex`
- For each campaign (set of slices), make a focused API call:
  - System: "Extract brand attributes from this email campaign"
  - User: the slices in order, labeled "Slice 1/3 of Campaign 1", "Slice 2/3 of Campaign 1", etc.
  - Request structured JSON: colors (hex), fonts, button styles, card radius, spacing, layout patterns, tone
- Use Sonnet (fast, cheap) for each per-campaign pass
- Run up to 3 in parallel with `Promise.all`

**Pass 2 — Synthesis:**
- Collect all per-campaign JSON outputs (text only, no images)
- Single API call with Opus: "Synthesize these individual analyses into a unified brand design system"
- Same output format as current (extraction + system_prompt)
- This pass is fast because it's text-only

### 3. Slicing for generation references (`generate-campaign/index.ts`)

Apply the same slicing logic server-side when fetching reference images for the generation and QA passes:

- After fetching each reference image as a buffer, check dimensions
- If height > 1400px, slice the image buffer into segments using canvas (Deno has no native canvas, so use the image dimensions from the response headers or a lightweight image-size check)
- Actually simpler approach: since these are already hosted URLs, we can use **ImageKit URL transformations** to extract slices: `tr:w-600,h-1300,cm-extract,y-0` for slice 1, `tr:w-600,h-1300,cm-extract,y-1300` for slice 2, etc.
- This means no server-side image processing — just construct the right URLs and fetch them
- Label each in the prompt: "Reference Campaign 1 — Slice 1/3", "Reference Campaign 1 — Slice 2/3", etc.

### 4. Practical limits baked in

- Max 10 reference campaigns for brand analysis
- Each sliced into max 4 segments = 40 images max for Pass 1 (spread across parallel calls)
- Pass 2 is text-only
- For generation: max 5 reference campaigns × 3 slices = 15 reference images + up to 15 asset images = 30 images total (well under the 100-image limit)
- When >20 images in one request, each is capped at 2000x2000 — our slices at 600x1300 are well under this

## Files Modified

1. **`src/pages/BrandSetup.tsx`** — Replace `resizeAndConvert` with `sliceImage` that produces labeled segments. Update `analyzeBrand` to send sliced data with campaign grouping metadata.

2. **`supabase/functions/extract-brand/index.ts`** — Complete rewrite to two-pass architecture:
   - Pass 1: parallel per-campaign analysis calls (Sonnet)
   - Pass 2: synthesis call (Opus) on text-only JSON
   - Accept new payload format with `campaignIndex`/`sliceIndex` metadata

3. **`supabase/functions/generate-campaign/index.ts`** — When building `imageBlocks` from reference URLs, use ImageKit `cm-extract` transforms to slice tall images into segments. Label each slice in the prompt text.

4. **`supabase/functions/_shared/imagekit.ts`** — Add a `getImageSliceUrls(baseUrl, imageHeight, sliceHeight)` helper that returns an array of ImageKit URLs with `cm-extract` transforms for each vertical slice.

## Implementation Details

### Client-side slicing function (BrandSetup.tsx)
```
sliceImage(file, maxSliceHeight=1300, maxWidth=600) → Promise<Array<{data, mediaType, sliceIndex, totalSlices}>>
```
Uses canvas to draw each slice region and export as JPEG.

### ImageKit server-side slicing (imagekit.ts)
```
getImageSliceUrls(url, totalHeight, sliceHeight=1300) → string[]
```
Returns URLs like: `url/tr:w-600,h-1300,cm-extract,y-0`, `url/tr:w-600,h-1300,cm-extract,y-1300`, etc.

Need to determine image height — fetch with a HEAD request or use ImageKit's `tr:oi-true` to get dimensions, or simply always slice into 3 segments for known-tall email references.

### Extract-brand Pass 1 prompt
```
"You are analyzing one email campaign split into {N} sequential slices (top to bottom).
Slice {i}/{N} is shown. Together they form one complete email.
Extract: colors (exact hex), fonts, button styles (radius, padding, colors), card/container border-radius, section spacing, layout approach, copy tone.
Return structured JSON only."
```

### Extract-brand Pass 2 prompt
```
"You have individual brand analyses from {N} email campaigns.
Synthesize into a unified brand design system. Identify the dominant patterns.
Where campaigns differ, note the primary approach and flag inconsistencies.
Return the standard extraction + system_prompt JSON."
```

