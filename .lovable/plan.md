

## Improve Ideation Quality: Port Brand DNA Studio's Richer Prompt Architecture

### Problem
The other project (Brand DNA Studio) produces better ideas because:
1. **Richer system prompt**: It includes 50 real copy examples (headlines, CTAs, body copy) from past campaigns, full brand report markdown, AI identity insights, content assets (quizzes, referral programs, press mentions), and product data extracted from campaign analyses.
2. **Better output format**: The user prompt asks for `campaign_info` and `copy_direction` fields here but the other project's prompts are more structured with chaos/entropy overlays and URL enrichment.
3. **More data sources**: The other project pulls from `copy_library`, `brand_content_assets`, `brand_profiles.ai_insights`, `brand_report_markdown`, and campaign analysis data — none of which our `build-ideation-prompt` uses.

### What's Different (Side-by-Side)

| Feature | This Project | Brand DNA Studio |
|---|---|---|
| Copy examples from past campaigns | ❌ Only campaign names | ✅ 50 real headlines, CTAs, body copy with campaign attribution |
| Brand report markdown | ❌ Not used | ✅ Full deep research report injected |
| AI identity insights | ❌ Not used | ✅ Creative strengths, patterns, differentiation |
| Content assets (quizzes, referral, press) | ❌ Not used | ✅ Full asset catalog with URLs and summaries |
| Products from campaign analyses | ❌ Not used | ✅ Extracted product names from all past campaigns |
| URL enrichment in briefs | ❌ | ✅ Fetches and inlines content from URLs in user briefs |
| Chaos/entropy inspiration anchors | ✅ Basic (10 anchors) | ✅ Richer (17 anchors, more diverse) |
| Creative fatigue tracking | ✅ Basic | ✅ Richer with per-type breakdown |

### Plan

#### 1. Enrich `build-ideation-prompt` with more data sources
- Pull **campaign analysis data** from past campaigns (headlines, copy, product focus) — equivalent to the other project's copy library
- Include **brand report** prose if available (from `brand_intelligence.compiled_context` — already done, but also check for any markdown report)
- Add **AI identity insights** from `brand_profiles.raw_extraction` (creative strengths, patterns, differentiation)
- Expand the copy examples section: extract real headlines and CTAs from campaign HTML or analysis data to give Lucy actual voice examples

#### 2. Add URL enrichment to `generate-ideas`
- When the user's `brief` or `feedback` contains URLs, fetch the page content (up to 4KB) and append it to the user prompt
- This lets users paste product pages, blog posts, or competitor emails and get ideas grounded in that content
- Port the `fetchUrlContent` and `enrichTextWithUrls` helpers from the other project

#### 3. Expand inspiration anchors
- Add the 7 missing anchors from the other project (Wes Anderson, J. Peterman, Sony 90s, VW Think Small, Got Milk?, Old Spice, Absolut Vodka)
- These give Claude more creative diversity when chaos mode is active

#### 4. Richer output format for non-turbo ideas
- Already asking for `campaign_info` and `copy_direction` — this is actually ahead of the other project
- No change needed here

#### 5. Strengthen the `generate-ideas` user prompt
- Add subtype extraction from `campaign_type_filter` (split on `:` for parent/subtype like the other project does)
- Include existing idea bank titles in the "avoid" list to prevent duplicates

### Files to Change
- `supabase/functions/build-ideation-prompt/index.ts` — add campaign copy examples, AI insights, richer brand data
- `supabase/functions/generate-ideas/index.ts` — URL enrichment, expanded anchors, subtype parsing, idea dedup
- Deploy both functions

### What This Won't Change
- The `ideation-chat` function — it's a lightweight conversational layer, not the idea generator
- The UI components — this is purely a prompt quality improvement
- Database schema — no new tables needed, we're reading existing data better

