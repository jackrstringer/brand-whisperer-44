

## Fix: URL on First Screen + Background Research + Ideation Guard

### Problem Summary
Two issues:
1. **URL not collected early enough**: Brand website URL is only gathered on step 2 ("sources"), meaning brand intelligence research can't start until later. It should be on step 1 ("info") so research runs in the background during the rest of setup.
2. **Ideation generates garbage when brand context is thin**: The `build-ideation-prompt` function runs but produces an empty prompt when there's no intelligence data yet. The `generate-ideas` function then sends this empty prompt to Claude, which hallucinates random industry ideas. There's no guard.

### Changes

#### 1. Move Website URL to Step 1 (BrandSetup.tsx — "info" step)
- Add a **required** Website URL field to the "info" step (lines 690-710), below Industry
- Keep the website URL field on the "sources" step too (for selecting it as a branding source), but pre-populate it from step 1
- On clicking "Next" from step 1, if `websiteUrl` is provided, fire-and-forget `research-brand` immediately — no need to wait for a brand DB record. We'll need to create the brand record early (just name + industry + url + user_id) at this point so research has a `brand_id` to write to

#### 2. Create Brand Record Early (BrandSetup.tsx)
- When user clicks "Next" on step 1, create the `brands` row immediately (name, industry, website_url, user_id)
- Store the brand ID in `earlyBrandId` state
- Fire off `research-brand` with this brand_id in the background
- Also create `brand_intelligence` row with `research_status: 'pending'`
- The existing code in `startSpecAndGuide` already checks for `earlyBrandId` and skips brand creation if it exists — this is compatible

#### 3. Guard Ideation Against Empty Context (generate-ideas/index.ts)
- After auto-building the ideation prompt (lines 160-185), check if the resulting prompt is too short (< 300 chars or missing key sections)
- If the prompt is empty/generic AND `brand_intelligence.research_status` is not `'complete'` or `'ai_complete'`, return an error: `"Brand intelligence is still processing. Please wait a moment and try again."`
- If research IS complete but `ideation_prompt` is still thin, rebuild it (the data exists but the prompt wasn't built from it)

#### 4. Rebuild Stale Ideation Prompts (generate-ideas/index.ts)
- After fetching `brandData`, also check `brand_intelligence.research_status` and `ideation_prompt_built_at`
- If `research_status` is `'ai_complete'` or `'complete'` but `ideation_prompt_built_at` is null or older than `last_researched_at`, force a rebuild via `build-ideation-prompt` — the research data exists but was never incorporated
- This prevents the scenario where research completes after the prompt was already built with no data

#### 5. Fix ideation-chat Similarly (ideation-chat/index.ts)
- The chat function (lines 30-40) loads brand context but has the same thin-context problem
- Add a check: if `intel.compiled_context` is null AND `intel.ai_research` exists, inline the key fields from `ai_research` (brand_overview, product_landscape) into the system prompt as a fallback

### Files Changed
- `src/pages/BrandSetup.tsx` — URL field on step 1, early brand creation, fire research
- `supabase/functions/generate-ideas/index.ts` — staleness check, context guard
- `supabase/functions/ideation-chat/index.ts` — ai_research fallback for thin context
- Deploy: `generate-ideas`, `ideation-chat`

