

# Fix: Add Skeleton Extraction Pre-Pass to Prevent Grid "Freelancing"

## Problem

In **Dupe mode**, the model receives reference screenshots as raw pixels and is told "produce an IDENTICAL structural replica." Despite explicit instructions, it still interprets grids loosely — e.g., converting a 2x2 equal grid into a "1 large + 2 stacked" mosaic layout (lines 72-83 of the uploaded HTML). The dupe prompt text is already good ("SAME image slot count," "SAME column layouts") but the model is working from pixels alone, which leads to creative interpretation rather than faithful replication.

Secondary issue: mismatched hardcoded heights (191px, 178px, 231px) within the same grid row.

## Solution: Structured Skeleton Extraction Pre-Pass

Add a fast, cheap AI call (Gemini 2.5 Flash) that analyzes the reference screenshots **before** the main generation call, and outputs a structured layout spec. The generation model then executes that spec instead of guessing from pixels.

---

### Step 1: Add skeleton extraction function

**File: `supabase/functions/_shared/generateCampaignCore.ts`**

Add a new `extractReferenceSkeleton()` function that sends the reference images to Gemini 2.5 Flash via the Lovable AI Gateway and returns a JSON skeleton like:

```json
{
  "sections": [
    { "type": "header", "layout": "centered-logo" },
    { "type": "hero-text", "layout": "dark-bg-headline-subheadline" },
    { "type": "grid", "columns": 2, "rows": 2, "equal_sizing": true, "labels": "below" },
    { "type": "cta", "layout": "centered-button" },
    { "type": "footer" }
  ],
  "total_image_slots": 4,
  "grid_patterns": ["2x2 equal"]
}
```

This call uses `LOVABLE_API_KEY` (already available in the environment). Cost: minimal. Latency: ~3-5 seconds.

### Step 2: Inject skeleton into reference/dupe mode prompts

**File: `supabase/functions/_shared/generateCampaignCore.ts`**

In the reference/dupe mode branch (around line 568), after fetching reference images, call `extractReferenceSkeleton()` and prepend the result to `userContent`:

```
STRUCTURAL SKELETON (extracted from reference — replicate this EXACTLY):
[skeleton JSON]

CRITICAL GRID RULES:
- "columns: 2, rows: 2, equal_sizing: true" = 2 <tr> rows, each with 2 <td> cells, ALL images identical width+height
- Do NOT convert equal grids into asymmetric mosaics, L-shapes, or "1 large + 2 small" layouts
- Match the exact column × row count from the skeleton
```

### Step 3: Strengthen anti-mosaic rules in REFERENCE_MODE_SYSTEM

**File: `supabase/functions/_shared/generateCampaignCore.ts`**

Add to `REFERENCE_MODE_SYSTEM` (line 207):

```
GRID GEOMETRY (CRITICAL):
- When the skeleton specifies an NxM equal grid, produce EXACTLY that geometry
- A 2×2 grid = 2 <tr> rows, each with 2 <td> cells of equal width+height
- Do NOT reinterpret equal grids as mosaic/magazine/asymmetric layouts
- All images in a grid row MUST share identical width AND height attributes
```

### Step 4: Add grid geometry check to QA (Pass 2)

**File: `supabase/functions/_shared/generateCampaignCore.ts`**

Add item 12 to `QA_SYSTEM_PROMPT` (around line 271):

```
12. GRID GEOMETRY: If a skeleton specifies "columns: 2, rows: 2, equal_sizing: true", verify the HTML has exactly 2 <tr> rows each with exactly 2 equal-width <td> cells. Flag any mosaic or asymmetric layout as critical.
```

### Step 5: Add anti-mosaic rule to Visual QA

**File: `supabase/functions/visual-qa/index.ts`**

Add to the system prompt's structural comparison section:

```
GRID GEOMETRY (CRITICAL): If the reference shows an NxN grid of equally-sized images, the output MUST replicate that exact geometry. A 2×2 equal grid converted into a "1 large + 2 stacked" mosaic is a CRITICAL failure (structural_fidelity ≤ 3).
```

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/_shared/generateCampaignCore.ts` | Add `extractReferenceSkeleton()`, inject skeleton into prompts, strengthen system prompts and QA checklist |
| `supabase/functions/visual-qa/index.ts` | Add anti-mosaic rule to structural comparison |

## Impact

- Adds ~3-5 seconds to reference/dupe mode generation (Gemini Flash is fast)
- No impact on standard mode (skeleton only runs when references are present)
- The generation model receives concrete specs like `grid: 2x2, equal` instead of guessing from pixels

