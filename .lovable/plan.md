

## Fix: Calendar Dates Not Using Brand Intelligence

### Root Cause
Two failures:
1. **`compiled_context` is NULL** for this brand — the function's primary context source is empty
2. **`ai_research` extraction is broken** — code looks for `aiResearch.category` but the actual structure is `aiResearch.brand_overview.primary_category`. The category hint resolves to the `industry` column value (likely empty or generic)

So the AI gets zero brand context and produces generic ideas.

### Fix (single file: `generate-calendar-dates/index.ts`)

1. **Extract category from the correct nested path**: `aiResearch.brand_overview.primary_category`, `aiResearch.brand_overview.target_demographic`, etc.

2. **Fall back to `ai_research` JSON when `compiled_context` is null**: Stringify a curated subset of `ai_research` (brand_overview, product_catalog, competitive_landscape) as the context block instead of sending nothing.

3. **Build a product summary** from `ai_research.product_catalog` to explicitly list what the brand sells (e.g., "Remineralizing chewing gum, natural toothpaste") so the AI can't miss it.

### Specific Code Changes

```typescript
// Fix category extraction from nested ai_research
let categoryHint = industry;
let productSummary = "";
if (aiResearch) {
  const overview = aiResearch.brand_overview || {};
  categoryHint = overview.primary_category || overview.sub_category || industry || "";
  const demo = overview.target_demographic;
  if (demo) {
    categoryHint += ` (audience: ${typeof demo === 'object' ? demo.psychographic_profile || '' : demo})`;
  }
  // Build product summary from catalog
  const catalog = aiResearch.product_catalog;
  if (catalog) {
    productSummary = JSON.stringify(catalog).slice(0, 2000);
  }
}

// Fall back to ai_research when compiled_context is null
let contextBlock = "";
if (context) {
  contextBlock = context.slice(0, 4000);
} else if (aiResearch) {
  // Stringify key sections as fallback
  const fallback = {
    brand_overview: aiResearch.brand_overview,
    product_catalog: aiResearch.product_catalog,
    competitive_landscape: aiResearch.competitive_landscape,
  };
  contextBlock = JSON.stringify(fallback, null, 2).slice(0, 4000);
}
```

Then inject `productSummary` into the prompt so the AI explicitly sees the product list.

### Files
- **Edit + deploy**: `supabase/functions/generate-calendar-dates/index.ts`

