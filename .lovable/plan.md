

# Redesign Onboarding Screen + Fix QA Image Cropping

## Two Problems

**1. Onboarding UI is cramped and unusable.** Three campaigns squeezed into tiny 375px-wide cards scaled to 50% — impossible to see. Feedback is a wall of questions dumped at the bottom.

**2. QA pass isn't actually cropping images.** The QA prompt tells the AI to "use the smart-cropped URL variant" but the QA pass only receives the final HTML as text — it has no access to the asset catalog with the smart-cropped/tight-cropped URL variants. So even if it detects bad images, it can't fix them because it doesn't know the correct URLs.

---

## Changes

### 1. Redesign `BrandOnboarding.tsx` — carousel + interactive per-campaign quiz

**Layout:** Full-width single campaign view with navigation to swap between designs.

- One large campaign preview at a time, rendered in a 470px-wide iframe (matching CampaignEditor settings) with proper scaling to fill available space
- Campaign name + status badge above, left/right arrow buttons to navigate between the 3 campaigns
- Dot indicators below the preview showing which campaign is active
- "1 of 3" counter

**Per-campaign feedback:** Each campaign gets its own feedback, shown as a one-question-at-a-time interactive quiz below the preview.

- State: `currentCampaign` index (0-2), `currentQuestion` index per campaign (0-3)
- Show one question at a time with thumbs up/down + optional text input
- "Next" button advances to next question. On last question, show "Submit Feedback for this Campaign" or "Next Campaign"
- After all 3 campaigns have feedback, show a final "Submit All & Refine" button
- Store answers as `Record<campaignId, FeedbackAnswer[]>`

**Generating state:** While campaigns are generating, show a clean centered loading state with a progress message — not skeleton cards.

### 2. Fix QA pass image cropping — pass asset catalog to QA

In `generate-campaign/index.ts`, the QA pass currently receives:
- Reference images (good)
- Brand rules (good)
- The generated HTML (good)
- But NOT the asset catalog with cropped URL variants (bad)

**Fix:** Include the `assetCatalog` string in the QA content so the AI can actually swap URLs:

Add to the QA text content:
```
=== AVAILABLE IMAGE VARIANTS ===
For any image that has excessive negative space, replace the URL with the tight-cropped variant below:
{assetCatalog}
```

Also strengthen QA checklist item #3 to be more explicit:
```
3. For EACH <img> tag in the HTML: check if the image URL appears in the asset catalog. If a tight-cropped variant exists, compare — if the original has excessive empty space, REPLACE the src with the tight-cropped URL. If no cropped variant exists and the image looks bad, REMOVE the <img> tag entirely.
```

---

## Files Modified

1. **`src/pages/BrandOnboarding.tsx`** — Complete rewrite: single-campaign carousel view, per-campaign one-at-a-time quiz, proper 470px iframe rendering
2. **`supabase/functions/generate-campaign/index.ts`** — Pass `assetCatalog` to QA content, strengthen image cropping enforcement in QA checklist

