

# Upgrade Brand Analysis Pipeline — Model, Prompts, and UX

Six changes across 3 files. All prompt/model/UX — no schema or architectural changes.

---

## Changes

### 1. `supabase/functions/audit-brand/index.ts`

**Model upgrade**: Change `claude-sonnet-4-20250514` to `claude-opus-4-6-20260801`, `max_tokens: 8000` to `16000` (line 276-277).

**Prompt expansion**: Add the following new schema fields to `SINGLE_PASS_AUDIT_PROMPT`:
- `campaign_inventory` (total count, campaign types observed with frequency)
- `campaign_color_system` (system_type, color inheritance, per-campaign examples)
- `logo_usage` (dedicated bar, light/dark rules, footer treatment)
- Expand `cta_buttons` with `cta_system_overview`, per-variant `is_color_campaign_reactive` + `observed_colors_across_campaigns`, and a `color_reactivity` sub-object
- Replace `headline_size_range` with `headline_sizing_system` (rule description + observed examples)
- Add `body_text_alignment` to typography

Add new instruction paragraphs to the prompt for campaign color system detection, body text alignment verification, headline sizing rules, and logo placement analysis.

### 2. `supabase/functions/extract-brand/index.ts`

**SPEC_PROMPT** (line ~223-247): Append structured `system_prompt` ordering rules — 10 sections from Campaign Color System through Prohibited Patterns. Add instruction that every rule must be traceable to reference campaigns.

**GUIDE_PROMPT** (line ~249-283): Add new mandatory sections:
- Section 0A: Campaign Inventory
- Section 0B: Campaign Color System (with live demo blocks)
- Section 0C: Logo Usage
- Restructure CTA section (system overview → base styles → variants → color reactivity → labels → non-negotiables)
- Component section requirements (live example + CSS + color reactivity + usage context)
- Font separation rule (guide chrome fonts vs campaign fonts)
- Specificity rule (no ranges where rules exist)

**Guide model upgrade** (line 432-434): Change `claude-sonnet-4-20250514` to `claude-opus-4-6-20260801`. Keep `max_tokens: 64000`.

### 3. `src/pages/BrandSetup.tsx`

**Progress messages** (lines 31-36): Update `GUIDE_MESSAGES` to reflect phase-based progress:
```
"Phase 1: Analyzing campaigns..."
"Phase 2: Building brand spec..."
"Phase 3: Generating brand guide (3-5 min)..."
"Finalizing documentation..."
```

**Status messaging** (lines 832-842): Replace the generating_guide UI with:
- Updated copy: "Deep brand analysis in progress. This typically takes 5-10 minutes for a complete brand guide."
- "Go to dashboard" button that navigates to `/brands/{brandId}`
- Live phase tracker showing 3 phases with running/complete/pending states and elapsed time per phase
- Subtitle: "You can leave this page — we'll notify you here when it's ready."

**Timeout** (line 453): Change `MAX_POLL_TIME` from `5 * 60 * 1000` to `15 * 60 * 1000`.

Also apply the same timeout increase in `src/components/brand/ReanalyzeBrand.tsx` if it has a similar `MAX_POLL_TIME` constant.

---

## Technical notes

- `claude-opus-4-6-20260801` is used via the same Anthropic API endpoint — no code changes needed beyond the model string.
- The audit prompt additions are additive — existing schema fields are preserved; new fields are added alongside them.
- The phase tracker in BrandSetup needs new state (`currentPhase`, `phaseTimings`) to track which step is active and render elapsed times.
- No database migrations required.

