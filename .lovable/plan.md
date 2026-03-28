

## Plan: Strip Down Reference/Dupe Mode Prompts

### Problem
When a reference campaign is provided, the AI receives too many competing instructions (UNIVERSAL_EMAIL_RULES, OBJECT-FIT RULE, STRUCTURAL VARIETY, CREATIVE DIRECTION, etc.) that dilute focus. The reference screenshot should be the primary instruction — everything else is noise.

### Changes — `supabase/functions/generate-campaign/index.ts`

#### 1. Add a minimal system prompt constant (~line 183, after UNIVERSAL_EMAIL_RULES)

```typescript
const REFERENCE_MODE_SYSTEM = `You are an expert HTML email developer.
Technical requirements — apply these always:
- HTML tables for all layout, all styles inline
- Wrapper: width="100%" style="max-width:600px; width:100%; margin:0 auto;"
- Gmail dark mode: add background-image:linear-gradient(#ffffff,#ffffff) alongside background-color:#ffffff on every white <td> and the wrapper
- Add in <style>: u+.body .gmail-blend-screen{background:#000;mix-blend-mode:screen;}
                  u+.body .gmail-blend-difference{background:#000;mix-blend-mode:difference;}
- No emoji anywhere — use inline SVG for all icons
- Footer required: brand name, unsubscribe link (#unsubscribe), address
- Return only complete HTML, no commentary, no markdown fences.`;
```

#### 2. Restructure user message construction for reference modes (~lines 432-690)

When `referenceMode` is set ("dupe" or "reference"), build a completely different `userContent` array with only these 5 parts in order:

1. **Brand reference screenshots** (existing `imageBlocks`) with label: "These are past campaigns from this brand — study them for design language, colors, fonts, and spacing only."
2. **Reference campaign images** (`referenceImageBlocks`) with label: "This is the reference layout to replicate. Clone its exact structure, section count, column layout, image sizing, and proportions. Apply the brand's colors, fonts, and copy on top."
3. **Brand rules** — just `profile.system_prompt` (colors, fonts, spacing tokens)
4. **Asset catalog** + product requirements (keep these — Claude needs to know what images exist)
5. **Brief** — "Generate a [goal] email. Brief: [brief]. [copy if provided]. Return only complete HTML."

**Remove from reference mode path:**
- `brandValuesText` block (brand values already in `system_prompt`)
- `CREATIVE DIRECTION` block
- `STRUCTURAL VARIETY RULES`
- `IMAGE & GRID LAYOUT RULES` / `OBJECT-FIT RULE` / `IMAGEKIT TRANSFORM SYNTAX` blocks
- `NO-STACK RULE`
- Dupe warning block
- The long reference/dupe instruction blocks (lines 478-531) — replaced by the simpler labels above

#### 3. Switch system prompt based on mode (~line 690)

```typescript
const systemPrompt = referenceMode ? REFERENCE_MODE_SYSTEM : UNIVERSAL_EMAIL_RULES;
// Use systemPrompt in the callAnthropic call
```

#### 4. Standard mode (no reference) — completely unchanged

All existing logic for `!referenceMode` stays exactly as-is.

### Files modified

| File | What changes |
|------|-------------|
| `supabase/functions/generate-campaign/index.ts` | Add `REFERENCE_MODE_SYSTEM` constant; fork user message construction into reference vs standard paths; use minimal system prompt for reference modes |

