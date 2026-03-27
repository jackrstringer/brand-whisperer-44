

## Plan: Robust Cross-Set Variant Apply & Preview

### Root Cause

Both `handleApplyVariant` and `handlePreviewVariant` have the same flaw: they only track what changed **within a single variant set** (via `applied_index` / `applied_texts`). When you apply a variant from Set A, then try to preview or apply from Set B (which targets the same original text), Set B's `find` target is stale — the original text no longer exists in the HTML.

### Solution: "Scan for live text" strategy

Instead of only checking within a single message's `applied_texts`, build a helper that scans the current HTML to determine what text is actually live for a given variant set. The search order:

1. Check if the original `find` text exists in the HTML → use it
2. If not, check if any variant's `replace` from **this same set** exists in the HTML → use the first match
3. If not, check `applied_texts` values from this set
4. If nothing matches → the text was manually edited away; disable the set gracefully

This single helper (`findLiveTarget`) is used by both `handleApplyVariant` and `handlePreviewVariant`, eliminating duplication and fixing both bugs at once.

### Changes

**File: `src/pages/CampaignEditor.tsx`**

1. **Add `findLiveTarget` helper** — given a variant message and the current HTML, returns the string currently in the HTML that this set can replace, or `null` if nothing matches.

```text
findLiveTarget(msg, html):
  if html.includes(msg.variant_data.variants[0].find) → return find
  for each variant in set: if html.includes(variant.replace) → return variant.replace
  for each appliedText: if html.includes(text) → return text
  return null
```

2. **Rewrite `handleApplyVariant`** — replace the existing find-target logic with a call to `findLiveTarget`. After applying, update `applied_texts` on the current message AND also update any other variant messages that share the same original `find` text (cross-set tracking).

3. **Rewrite `handlePreviewVariant`** — same `findLiveTarget` call, silently skip if no match (no error toast needed for preview).

4. **Cross-set sync on apply** — after applying a variant, iterate all variant messages. For any message whose original `find` overlaps with the text that was just replaced, update that message's `applied_texts` to record the new state. This ensures future apply/preview from those sets will find the correct text.

### What this fixes
- Applying variant from Set B after Set A applied → works (finds the live text via scan)
- Preview on hover for old sets → works (same scan logic)
- Switching between variants within a set → still works (existing logic preserved)
- Text manually edited away → graceful "not found" instead of silent failure

### Technical detail

```typescript
function findLiveTarget(variantData: VariantData, html: string): string | null {
  const originalFind = variantData.variants[0]?.find;
  if (!originalFind) return null;
  
  // 1. Original text still present
  if (html.includes(originalFind)) return originalFind;
  
  // 2. Any variant's replace text present (someone applied from this set)
  const appliedTexts = variantData.applied_texts || {};
  const appliedIdx = variantData.applied_index;
  if (appliedIdx !== null && appliedIdx !== undefined) {
    const liveText = appliedTexts[appliedIdx] 
      || variantData.variants[appliedIdx]?.replace;
    if (liveText && html.includes(liveText)) return liveText;
  }
  
  // 3. Check all variant replaces (cross-set apply may have used one)
  for (const v of variantData.variants) {
    if (html.includes(v.replace)) return v.replace;
  }
  
  // 4. Check all tracked applied texts
  for (const text of Object.values(appliedTexts)) {
    if (typeof text === 'string' && html.includes(text)) return text;
  }
  
  return null;
}
```

Both handlers become simple:
```typescript
const findTarget = findLiveTarget(msg.variant_data, html);
if (!findTarget) { /* toast error or silently skip */ return; }
// proceed with replace using findTarget
```

