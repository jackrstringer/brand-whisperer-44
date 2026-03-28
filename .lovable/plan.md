

## Plan: Teach the AI to Analyze Reference Image Slot Dimensions and Apply "Object-Fit" Logic

### Problem
The AI has ImageKit transform instructions but doesn't **analyze the reference's actual image slot proportions**. When a reference shows a 2×2 grid of square images, the AI sees it but doesn't extract "these are ~280×280 square slots" and apply `?tr=w-280,h-280,fo-auto` to force-fit the brand's images. It just drops images in at their native aspect ratio.

### Solution
Strengthen the generation prompt to explicitly instruct the AI to **measure and replicate reference image slot proportions** using a "Figma object-fit" mental model. Also strengthen the QA pass to catch proportion mismatches.

### Changes

#### 1. `supabase/functions/generate-campaign/index.ts` — Generation prompt improvements

**In the reference mode instructions** (both "reference" and "dupe" blocks, ~lines 478-513):
Add an explicit step: "Before generating, analyze each image slot in the reference: Is it square? Wide banner? Portrait? 2×2 grid? Note the approximate aspect ratio of every image slot, then apply the matching ImageKit `fo-auto` crop to every brand image you place in that slot."

**In the IMAGE & GRID LAYOUT RULES section** (~line 591-625):
Replace the current generic transform docs with a stronger "Object-Fit" paradigm:

```
=== OBJECT-FIT RULE (CRITICAL — like Figma's "Fill" mode) ===
When placing ANY image into a layout slot defined by the reference:
1. DETERMINE the slot's aspect ratio from the reference (square = 1:1, wide banner ≈ 2.4:1, etc.)
2. CALCULATE pixel dimensions: for a 2-column grid at 470px width with gaps, each slot ≈ 220px wide. Square = 220×220. Wide = 470×200.
3. APPLY fo-auto crop: append ?tr=w-{W},h-{H},fo-auto to the ik.imagekit.io URL
4. SET matching width/height on the <img> tag AND its container

Common slot patterns to recognize in references:
- 2×2 square grid → each image: ?tr=w-220,h-220,fo-auto (or ar-1-1,w-220)
- Full-width hero banner → ?tr=w-470,h-300,fo-auto
- 2-column product cards → ?tr=w-220,h-280,fo-auto
- Single centered product → ?tr=w-300,h-400,fo-auto

EVERY image in a grid MUST use identical transform dimensions. No exceptions.
```

#### 2. `supabase/functions/generate-campaign/index.ts` — QA Pass 2 prompt

In the QA system prompt (~line 219-220), strengthen the image-fit checks:

```
9. IMAGE SLOT PROPORTIONS: For every <img> in a grid or multi-image section, verify ALL images use IDENTICAL width and height attributes AND identical ImageKit transforms. If any image in a 2×2 or 2×3 grid has different dimensions than its siblings, normalize them all to the same ?tr=w-X,h-Y,fo-auto transform. This is a CRITICAL issue.
10. ASPECT RATIO MATCH: If the reference shows square image slots, every image must be cropped square via fo-auto. Portrait images jammed into landscape slots (or vice versa) MUST be fixed with appropriate fo-auto transforms.
```

#### 3. `supabase/functions/aggressive-qa/index.ts` — Perfection mode QA

Add to the system prompt's comparison checklist:
```
IMAGE SLOT PROPORTIONS (HIGHEST PRIORITY):
- Count image slots in the reference. Count in the output. Must match.
- If reference shows a 2×2 grid of square images, output MUST have 2×2 square images.
- Every image in a grid must have IDENTICAL dimensions via ImageKit ?tr=w-X,h-Y,fo-auto.
- Portrait images in landscape slots = CRITICAL failure.
- Missing fo-auto transforms on grid images = CRITICAL failure.
```

### Files modified

| File | What changes |
|------|-------------|
| `supabase/functions/generate-campaign/index.ts` | Rewrite IMAGE & GRID LAYOUT RULES with object-fit paradigm; strengthen reference mode instructions to extract slot proportions; strengthen QA Pass 2 image checks |
| `supabase/functions/aggressive-qa/index.ts` | Add image slot proportion checks as highest-priority items in system prompt |

