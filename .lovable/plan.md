<final-text>Goal: stop ideation from ever defaulting to random categories, start intelligence research as soon as a brand is created, and block ideation with an in-context modal when intelligence is missing.

What I found:
- I did not find any hardcoded “Agent Nateur” bleed in the current ideation code.
- The real failures are structural:
  1. `BrandSetup.tsx` starts background research with `website_url`, but `research-brand` only accepts `domain`. So fresh-brand research is not actually kicking off there.
  2. `build-ideation-prompt/index.ts` reads `ai_research.primary_category`, `brand_positioning`, etc. at the wrong level. `research-brand` stores those under nested keys like `ai_research.brand_overview.*` and `ai_research.product_landscape.*`.
  3. `generate-ideas/index.ts` validates prompts too loosely, so a thin or malformed prompt can still pass and generate generic category drift.
  4. `ideation-chat/index.ts` has the same nested-data bug, and the client-side `streamChat` path is currently unused/stale.
  5. The Ideate UI has no hard blocker when intelligence is missing, so it tries to ideate anyway.

Implementation plan:
1. Fix background research kickoff at brand creation
- In `src/pages/BrandSetup.tsx`, make Website URL required on the first step.
- Keep website selection on the branding-source step, but clearly separate:
  - required URL for intelligence research
  - optional website source for branding extraction
- Change all `research-brand` calls there to send `{ domain: websiteUrl }`, not `{ website_url: ... }`.

2. Fix prompt building so it uses the actual research schema
- Refactor `supabase/functions/build-ideation-prompt/index.ts` to read:
  - `brand_overview.primary_category`, `sub_category`, `brand_positioning`, `mission_statement`, `brand_story`, `brand_voice_and_tone`
  - `product_landscape.hero_products`, `bestsellers`, `bundles_or_kits`, `new_launches`
  - relevant `customer_intelligence`, `marketing_intelligence`, `competitive_landscape`, and `sales_model`
- Strengthen the category/product grounding and keep the category lock tied to real extracted data, not missing fields.

3. Make ideation fail loud instead of drifting
- In `supabase/functions/generate-ideas/index.ts`, replace the current marker/length-based check with real context validation.
- Only allow ideation if there is grounded brand context from compiled context, nested AI research, or merged profile.
- If intelligence is missing or still processing, return a structured blocking response instead of generating generic ideas.
- If research exists but the prompt is stale/bad, force a rebuild before ideation.

4. Update ideation chat/context paths too
- Fix `supabase/functions/ideation-chat/index.ts` to use the same nested intelligence fields.
- Extract a shared brand-context builder/helper so `generate-ideas` and `ideation-chat` cannot diverge again.
- Keep visible AI commentary suppressed in the UI; this is a context fix, not a UX change toward chatty responses.

5. Add the ideation-side intelligence modal
- On the Ideate page, load brand-intelligence status with the ideation state.
- If the user tries to ideate without grounded intelligence, show a modal inside the ideation area.
- Reuse the existing intelligence flow pieces so the user can:
  - confirm/add URL if needed
  - run research
  - wait for completion
- Once research completes and the ideation prompt rebuilds, automatically unblock the ideation flow so they can continue without leaving the page.

6. Tighten related entry points
- Review other research triggers and make sure they all use the same `domain` contract.
- Make sure a later website URL change can trigger a fresh research run and prompt rebuild.

Files to update:
- `src/pages/BrandSetup.tsx`
- `src/pages/IdeatePage.tsx`
- `src/hooks/useIdeation.ts`
- `supabase/functions/build-ideation-prompt/index.ts`
- `supabase/functions/generate-ideas/index.ts`
- `supabase/functions/ideation-chat/index.ts`
- likely one small new ideation modal component or shared hook

Verification:
- Fresh brand: step 1 URL immediately starts research in the background.
- Existing researched brand like Larine: prompt rebuild uses oral-health data and stops producing skincare.
- No-intelligence edge case: Ideate blocks, opens modal, runs research, rebuilds prompt, then resumes.
- No fake fallback behavior: missing context surfaces a clear blocker instead of hallucinated ideas.

No schema migration appears necessary for this fix.</final-text>