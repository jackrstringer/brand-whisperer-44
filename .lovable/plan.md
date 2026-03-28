

## Plan: Premium "Perfection Mode" — 3 Variants with Aggressive QA Loop

### What this adds

A new generation mode ("Perfection Mode") that generates 3 distinct campaign options in parallel, each with a unique creative direction, then QA-loops each one aggressively (including reference comparison and rendered screenshot comparison) until they pass. The user picks their favorite.

### Architecture

```text
┌─────────────────────────────┐
│  User clicks "Perfection"   │
│  (new toggle in editor)     │
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  generate-campaign-multi (new)  │
│  Creates 3 sub-campaigns        │
│  Each gets a unique creative    │
│  direction seed + same brief    │
│  Calls generate-campaign 3x     │
│  in parallel (reuses existing)  │
└─────────┬───────────────────────┘
          │ Each sub-campaign saved
          ▼
┌─────────────────────────────────┐
│  aggressive-qa (new function)   │
│  For each variant:              │
│  1. Render screenshot server-   │
│     side-style (passed in)      │
│  2. Send screenshot + reference │
│     campaign images + HTML to   │
│     vision AI                   │
│  3. AI compares against ref,    │
│     flags ALL issues            │
│  4. Apply fixes → re-render →   │
│     re-QA (up to 3 rounds)      │
│  5. Only "pass" when score ≥ 9  │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  Frontend: Variant Picker UI    │
│  Shows 3 side-by-side previews  │
│  User clicks to select winner   │
│  Winner becomes the campaign    │
└─────────────────────────────────┘
```

### Changes

#### 1. Database: Add variant storage columns
**Migration**: Add `variant_htmls` (jsonb, nullable) and `generation_mode` (text, default 'standard') to `campaigns` table. `variant_htmls` stores an array of `{ html, qa_score, qa_summary, creative_seed }` objects during multi-generation.

#### 2. New edge function: `generate-campaign-multi/index.ts`
- Accepts same params as `generate-campaign` plus `mode: "perfection"`
- Creates 3 creative direction seeds:
  - Variant A: "Editorial & bold — dramatic imagery, magazine-style layout"
  - Variant B: "Clean & minimal — generous whitespace, restrained palette"  
  - Variant C: "Dynamic & engaging — mixed media sections, interactive feel"
- Calls existing `generate-campaign` function 3x in parallel (via internal fetch), each with a different `creativeSeed` appended to the brief/designNotes
- After all 3 complete, triggers aggressive QA on each

#### 3. New edge function: `aggressive-qa/index.ts`
The key improvement: this function receives both the **reference campaign images** AND the **rendered output screenshots**, and does a true side-by-side comparison.

- Inputs: `{ html, referenceImageUrls, renderedSlices, brandValues, roundNumber }`
- Uses Gemini 2.5 Pro (vision) for maximum quality
- System prompt explicitly asks: "Compare the rendered output against the reference. Flag ANY deviation the user would notice."
- Scoring: must reach score ≥ 9/10 to pass
- If fails: applies fixes, returns `{ fixedHtml, passed: false, score, issues }` — caller re-renders and re-submits (up to 3 rounds)
- Checks: layout match, image proportions, spacing, color accuracy, text readability, button styling, overall polish

#### 4. Frontend: Perfection Mode toggle + Variant Picker

**`src/pages/CampaignEditor.tsx`**:
- Add `generationMode` state: `"standard" | "perfection"`
- Toggle button in the generation form area (next to brief)
- When `perfection` mode:
  - Calls `generate-campaign-multi` instead of `generate-campaign`
  - Polls for `variant_htmls` on the campaign record
  - When all 3 variants are ready, shows a **Variant Picker overlay**

**New component: `src/components/campaign/VariantPicker.tsx`**:
- Full-width overlay showing 3 scaled iframe previews side-by-side
- Each shows QA score badge and creative direction label
- Click to select → sets `campaign.html` to chosen variant, clears `variant_htmls`
- "Regenerate" button per variant if user wants a fresh attempt

#### 5. Visual QA improvements (existing `visual-qa/index.ts`)
- Add `referenceImageUrls` input parameter
- When provided, include reference images in the vision prompt: "Here is the reference campaign the user chose. Compare the output against it."
- Increase quality threshold: issues with severity "critical" auto-fail regardless of score
- Use `google/gemini-2.5-pro` instead of flash for perfection mode QA

#### 6. Client-side rendering for QA
- Move screenshot capture to happen per-variant on the client
- After each variant HTML arrives, render in hidden iframe, capture slices, send to `aggressive-qa`
- Loop: if QA returns fixes, update HTML, re-capture, re-submit (max 3 rounds)
- Show per-variant progress: "Generating... → QA Round 1... → QA Round 2... → Ready ✓"

### Files summary

| File | What |
|------|------|
| Migration | Add `variant_htmls` jsonb and `generation_mode` text to campaigns |
| `supabase/functions/generate-campaign-multi/index.ts` | New: orchestrates 3 parallel generations with creative seeds |
| `supabase/functions/aggressive-qa/index.ts` | New: reference-compared vision QA with fix loop |
| `supabase/functions/visual-qa/index.ts` | Add reference image comparison, use Pro model option |
| `src/components/campaign/VariantPicker.tsx` | New: 3-up variant preview picker UI |
| `src/pages/CampaignEditor.tsx` | Add perfection mode toggle, variant polling, QA loop orchestration |
| `src/lib/visualQaCapture.ts` | No changes needed (already captures slices) |

### Not included (future)
- Server-side rendering (Puppeteer) — sticking with client-side html2canvas for now
- More than 3 variants
- A/B testing integration

