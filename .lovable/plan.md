

## Plan: Upgrade copywriting + visual copywriting via the Email Design Element Library

### Goal
Make our generated emails dramatically more skimmable and visually punchy by teaching the generator + ideation engine your new "design element library" — the 50+ named visual copy blocks (Us vs Them, Stat Strip, Feature Checklist Matrix, Bundle Stack, Numbered Callout, etc.) from the uploaded `block-library_1.md`.

The principle to enforce everywhere: **a reader should be able to skim and absorb 80% of the message from the visual elements alone, without reading body paragraphs.**

### Where this hooks in
1. **Campaign generation** (`_shared/generateCampaignCore.ts`) — both standard mode and reference/dupe mode.
2. **Edit pipeline** (`edit-campaign/index.ts`) — so chat edits can request specific blocks ("add a Stat Strip", "swap intro for a Feature Checklist Matrix").
3. **Ideation** (`generate-ideas`, `build-ideation-prompt`, `ideation-chat`) — so Lucy proposes ideas in terms of design-element-driven angles, not generic ones.
4. **QA pass** (`QA_SYSTEM_PROMPT` inside `generateCampaignCore.ts`) — add a "skimmability check" so visually thin emails get flagged.

### Changes

**1. New shared skill file: `supabase/functions/_shared/emailCopywriterSkill.ts`**
- Embed the full block library (all 8 categories, every named element with its copy spec + design note).
- Export:
  - `EMAIL_DESIGN_ELEMENT_LIBRARY` — the full reference block.
  - `DESIGN_ELEMENT_USAGE_RULES` — short rules: 1–3 elements per email, sweet spot placement (one in top half / one in bottom half), skim test, naming convention so the AI tags each block in HTML with `data-block-type="us-vs-them"` etc. for traceability.
  - `SKIMMABILITY_REQUIREMENT` — single-paragraph hard rule used everywhere.

**2. Generation prompt upgrade (`_shared/generateCampaignCore.ts`)**
- Inject `EMAIL_DESIGN_ELEMENT_LIBRARY` + `DESIGN_ELEMENT_USAGE_RULES` into both `UNIVERSAL_EMAIL_RULES` and `REFERENCE_MODE_SYSTEM` (gated so reference/dupe mode still respects the reference structure but can use library terminology when filling sections).
- For **flow** mode: include only the design elements that make sense in flows (no hype urgency banners on transactional, etc.) — gated by the existing `isTransactional` flag we already added.
- Add a hard requirement: every campaign must include at least 1 named design element from the library (2–3 ideal), each tagged in HTML with a comment + `data-block-type` attribute matching the library name.

**3. QA prompt upgrade (same file)**
- Extend `QA_SYSTEM_PROMPT` with a "Skimmability" section. New JSON field `skimmability` with `pass/fail` + `reason`. Failure case: email is wall-of-text with no named design elements, or only generic image+text rows.
- Failure triggers an automatic edit pass (already wired) to inject the missing element types.

**4. Edit pipeline (`edit-campaign/index.ts`)**
- Inject `EMAIL_DESIGN_ELEMENT_LIBRARY` so chat commands like "add a comparison table" or "make this more skimmable" resolve to a real named block.
- Add explicit edit verbs: `add_block`, `swap_block`, `convert_to_block` referencing library names.

**5. Ideation upgrade (`generate-ideas`, `build-ideation-prompt`, `ideation-chat`)**
- Add a new optional field on each generated idea: `featured_design_elements` — 1–3 element names from the library that the campaign would lead with.
- This makes Lucy's output more concrete (not "send a press email" but "Press Logo Bar + Numbered Callout + Founder Quote Card").
- Wire it through `lib/ideation/` types so the cards can optionally render the block names as small chips later (UI is out of scope for this round, but data is captured).

**6. Mapping idea → generation**
- In `lib/ideation/` mapping (already references `idea.title`/`idea.brief`), pass `featured_design_elements` into the campaign brief so the generator gets a strong steer toward those exact named blocks.

### What we explicitly do NOT change
- No UI components in this pass (cards, calendar, editor) beyond data plumbing for the new ideation field.
- No changes to slicing, reference analysis, Klaviyo, or flow Liquid logic.
- Reference/dupe mode still treats reference as the structural blueprint — the library is used to *name* the existing sections rather than override them.

### Files to update
- New: `supabase/functions/_shared/emailCopywriterSkill.ts`
- `supabase/functions/_shared/generateCampaignCore.ts` (system prompts + QA prompt)
- `supabase/functions/edit-campaign/index.ts`
- `supabase/functions/generate-ideas/index.ts`
- `supabase/functions/build-ideation-prompt/index.ts`
- `supabase/functions/ideation-chat/index.ts`
- `src/lib/ideation/campaignTypes.ts` and/or `src/lib/types.ts` (add optional `featured_design_elements: string[]` on the idea type)
- `src/hooks/useIdeation.ts` (pass through field, no UI change)
- Memory: add `mem://logic/email-design-element-library` describing the system rule.

### Technical details
- The library lives in code (not DB) so it ships with deploys and stays versioned.
- Each named block becomes addressable via `data-block-type="<slug>"` in generated HTML — this unlocks future targeted edits ("rebuild the Stat Strip") without re-touching anything else.
- Skimmability QA failure triggers the existing edit loop — no new infra.
- Transactional flows are excluded from promotional-only blocks (countdown, gift-with-purchase, promo code) using the existing `isTransactional` check.
- The uploaded `.skill` zip is just a Claude skill packaging of the same library; we're embedding the library directly into our prompts, which is the equivalent of "loading the skill" in our own pipeline.

### Verification after implementation
1. Generate a fresh promo campaign → confirm HTML contains 1–3 elements with `data-block-type="..."` matching library slugs.
2. Generate a transactional flow → confirm none of the promo-only blocks appear.
3. Run an edit like "make this more skimmable, add a Feature Checklist Matrix" → confirm the new block lands and is properly tagged.
4. Generate ideas → confirm each idea returns `featured_design_elements` populated.
5. Generated copy per block should match the spec: short, structured, label-style — not paragraphs.

