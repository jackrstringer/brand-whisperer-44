

## Plan: Simplify Calendar Ideation Prompt

### Problem
The prompt is over-engineered with rigid constraints (4 evergreen / 1 promo ratio, lists of banned mechanics, prescribed idea categories). This forces the AI into awkward territory — shoehorning unrelated angles into a date context instead of finding the natural connection between the brand and the occasion.

### Approach
Strip the prompt down to essentials: here's the brand, here are its products, here's the date — come up with smart campaign ideas. One simple guardrail: at most 1 idea can include a promotion/discount. Everything else is left to the AI's judgment.

### Changes

**`supabase/functions/generate-calendar-dates/index.ts`** — Rewrite the ideation prompt (lines 156-180) and system message (line 192):

**New system message:**
```
You are an elite email marketing strategist for DTC ecommerce brands.
Return ONLY valid JSON via the tool call.
```

**New prompt (simplified):**
```
## THE BRAND
Brand: "{brandName}"
Category: {categoryHint}
{product catalog if available}
{brand context if available}

## THE DATES
{datesList}

## TASK
For each date above, come up with 5 email campaign ideas for {brandName}.

Find the natural, authentic connection between the brand/products and the occasion. Don't force it — if the link is tenuous, lean into humor or cleverness rather than pretending relevance.

At most 1 out of 5 ideas may include a promotional mechanic (discount, sale, bundle, etc.). The rest should drive engagement without needing an offer.

Reference the brand's actual products by name. Each idea should feel like something a top-tier DTC brand would actually send.
```

This removes:
- The prescriptive "4 evergreen / 1 promo" categories with banned mechanics lists
- The forced idea archetypes (UGC, founder story, how-to, etc.)
- The "think like Javy Coffee, Liquid Death" comparisons
- The redundant system message reinforcement

Also upgrade the model from `gemini-2.5-flash` to `google/gemini-2.5-pro` for ideation quality — this is a creative task where reasoning matters.

### Files
| File | Change |
|------|--------|
| `supabase/functions/generate-calendar-dates/index.ts` | Simplify ideation prompt, upgrade model to gemini-2.5-pro |

