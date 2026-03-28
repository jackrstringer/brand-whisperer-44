

## Plan: Intelligent Image Fitting with ImageKit Transforms + Stricter QA

### Problem

The generation prompt currently tells the AI "Do NOT modify, crop, or transform the URLs" (line 591). When the AI clones a reference layout that has specific image slot proportions (e.g., square thumbnails, wide hero banners), it jams in brand/product images at their original aspect ratios, causing visual mismatches. The QA Pass 2 is text-only (checks brand values via JSON patch) and doesn't catch visual image-fit issues.

### Solution

Two changes: (1) teach the AI to use ImageKit URL transforms during generation, and (2) add image-fit auditing to the QA pass.

### Changes

**File: `supabase/functions/generate-campaign/index.ts`**

#### 1. Replace "Do NOT modify URLs" with ImageKit transform guide

Remove line 591's prohibition. Replace with an ImageKit transform reference that teaches the AI how to append `?tr=` params to ImageKit-hosted URLs:

```text
=== IMAGEKIT IMAGE TRANSFORMS (use these to fit images into layout slots) ===
All brand/product images hosted on ik.imagekit.io support URL-based transforms.
Append ?tr=<params> to any ik.imagekit.io URL. Available transforms:

SIZING & CROPPING:
- w-{N}         → resize to width N pixels
- h-{N}         → resize to height N pixels  
- w-{N},h-{N},c-maintain_ratio   → fit within box, maintain aspect ratio
- w-{N},h-{N},c-force            → force exact dimensions (may distort)
- w-{N},h-{N},c-at_max           → scale down to fit, never upscale
- w-{N},h-{N},fo or fo-auto      → smart crop to exact dimensions (AI selects focal point)
- ar-{W}-{H},w-{N}               → crop to aspect ratio at given width (e.g. ar-1-1,w-300 for square)

BACKGROUND:
- e-bgremove    → remove background (transparent PNG)

EXAMPLES:
- Square thumbnail: ?tr=w-280,h-280,fo-auto
- Wide banner from portrait photo: ?tr=w-600,h-250,fo-auto  
- Remove background: ?tr=e-bgremove
- Fit in slot without distortion: ?tr=w-400,h-300,c-at_max

RULES:
- ONLY modify ik.imagekit.io URLs. Leave all other URLs untouched.
- When the reference layout has specific image slot proportions, use fo-auto cropping to match.
- Prefer c-at_max or fo-auto over c-force to avoid distortion.
- For product grids, ensure all product images use the SAME transform dimensions.
```

#### 2. Add image-fit checks to QA Pass 2 prompt

Extend `QA_SYSTEM_PROMPT` to include image-fit auditing:

```text
9. IMAGE FIT: Check that every <img> tag's dimensions are appropriate for its container. 
   If an image is portrait but placed in a landscape slot (or vice versa), add ImageKit 
   transforms (?tr=w-X,h-Y,fo-auto) to the src URL to make it fit. Only modify 
   ik.imagekit.io URLs. Flag as "major" severity.
10. IMAGE CONSISTENCY IN GRIDS: All images in a product grid or multi-image section must 
    use the same dimensions. If they don't, normalize them with matching transforms.
```

#### 3. Add image-fit check to Visual QA prompt

Extend the `visual-qa` function's `SYSTEM_PROMPT` to explicitly check for image proportion mismatches:

```text
10. IMAGE FIT: Are images properly proportioned for their containers? Look for: 
    portrait images squeezed into landscape slots, stretched/squished photos, 
    images that clearly don't match the aspect ratio of their container. 
    These are CRITICAL issues. In the fix, append ImageKit transforms 
    (?tr=w-X,h-Y,fo-auto) to ik.imagekit.io URLs.
```

### Files modified

| File | What changes |
|------|-------------|
| `supabase/functions/generate-campaign/index.ts` | Replace URL-modification prohibition with ImageKit transform guide; add image-fit items to QA Pass 2 prompt |
| `supabase/functions/visual-qa/index.ts` | Add image-fit checking to visual QA system prompt |

