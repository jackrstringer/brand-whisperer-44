

# Improve Campaign Edit & Variant System (Learning from Lucy)

## Problem
The current patch-based editing system frequently fails because the AI's `find` strings don't exactly match the HTML. Variants work but lack re-selection support — once applied, you can't switch to a different option without the find string being stale.

## Key Improvements from Lucy to Apply

### 1. Full-HTML Retry Fallback in `edit-campaign`
When all patches fail (0 applied), automatically retry with a second AI call requesting the complete modified HTML instead of patches. This eliminates the "No change applied" dead end.

**In `edit-campaign/index.ts`**: After detecting `patchCount === 0`, make a second Anthropic call with a simpler prompt: "Return the full modified HTML wrapped in `<email_html>` tags." Use the existing `htmlMatch` fallback parser.

### 2. Re-Selection Support for Variants
Track what text was actually applied so users can switch between variant options after the first apply.

**Changes:**
- Add `applied_texts` to `VariantData` type — a `Map`-like structure `Record<number, string>` tracking what replacement text is currently live in the HTML per variant index
- In `handleApplyVariant`: before replacing, check if a previous variant was applied (via `applied_index`). If so, use the previously applied variant's `replace` text as the new `find` target instead of the original `find`
- Update `VariantCards` to allow clicking a different option even after one is applied (remove the locked/disabled state)

### 3. Better Patch Matching with Normalization
Improve `applyPatches()` in the edge function to handle common mismatches:
- Normalize HTML entities (`&amp;` vs `&`, `&#39;` vs `'`)
- Collapse whitespace before matching
- Try case-insensitive match as last resort for color values

### 4. Smarter Variant Detection in System Prompt  
Add an explicit `isOptionsIntent` check server-side (like Lucy's regex) so the AI reliably enters variant mode. Currently it depends entirely on the AI interpreting the system prompt correctly.

**In `edit-campaign/index.ts`**: Add regex detection before the AI call. If the message matches options-intent patterns, prepend a hint to the user message: `"[USER WANTS OPTIONS — use VARIANT MODE]"`.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/edit-campaign/index.ts` | Add retry fallback, options-intent detection, improved patch matching |
| `src/lib/types.ts` | Add `applied_texts` to `VariantData` |
| `src/components/brand/VariantCards.tsx` | Allow re-selection after apply |
| `src/pages/CampaignEditor.tsx` | Update `handleApplyVariant` for re-selection logic |

## Technical Details

### Retry fallback (edit-campaign)
```text
User message → AI (patch mode) → 0 patches matched?
  YES → 2nd AI call (full-HTML mode, ~8K tokens) → save result
  NO  → apply patches as normal
```

### Re-selection flow
```text
User picks Option A → applied_index=0, applied_texts={0: "new headline A"}
User picks Option B → find target = applied_texts[0] (not original find)
                     → replace with Option B's text
                     → applied_index=1, applied_texts={1: "new headline B"}
```

### Options-intent regex
```typescript
const isOptionsIntent = /\b(option|alternative|variation|variant|idea|choice|version)s?\b/i.test(message)
  || /\bgive me \d/i.test(message)
  || /\bshow me \d/i.test(message);
```

