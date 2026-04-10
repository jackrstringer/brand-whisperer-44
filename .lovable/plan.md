

# Plan: Fix Personalization Override and Fallback Quality

## Problem

The AI keeps injecting `{{ person.first_name|default:'there' }}` into headlines even when the reference has no personalization. This happens because the `klaviyoBestPractices.ts` file contains multiple hard directives telling the AI to **always** use first-name personalization -- these override the "reference-first" rule we added to the system prompt.

Additionally, the fallback value `'there'` creates grammatically broken sentences when used mid-headline (e.g., "Still interested, there?" reads as nonsense).

## Root causes

Three locations in `klaviyoBestPractices.ts` push personalization:

1. **Line 1828**: "THE RULE: Always use `{{ person.first_name | default: 'there' }}` in the opening line"
2. **Line 2576** (inside `KLAVIYO_FLOW_LIQUID_REFERENCE`): `person.first_name → Always use |default:'there'`
3. **Lines 2602-2640** (flow structure templates): Multiple templates list "Personalized greeting (person.first_name)" as a required section

The system prompt says "reference-first" but these embedded docs say "always" -- the AI sees both and defaults to the more explicit, repeated instruction.

## Changes

### File 1: `supabase/functions/_shared/klaviyoBestPractices.ts`

**Section 7.7 (lines 1822-1830)**: Rewrite to remove the blanket "always" rule. Replace with guidance that personalization is powerful but should only be used when the reference shows it or the user requests it. When used, the fallback must be grammatically safe in context -- e.g., `'Friend'` or `'there'` for standalone greetings like "Hi there," but never inline in phrases like "Still interested, X" where the fallback creates broken grammar.

**Person Properties section in `KLAVIYO_FLOW_LIQUID_REFERENCE` (line 2576)**: Change "Always use |default:'there'" to "Use |default:'Friend' — only include if reference shows personalization or user requests it"

**Personalization patterns section (lines 2586-2593)**: Add a warning about grammatical safety of fallbacks. If the name appears mid-sentence (not in a standalone "Hi X," greeting), use a conditional block instead:
```
{% if person.first_name %}Still interested, {{ person.first_name }}?{% else %}Still interested?{% endif %}
```

**Flow structure templates (lines 2602-2640)**: Remove "Personalized greeting (person.first_name)" as a mandatory section from Browse Abandonment and other templates where the reference may not include it. Instead note it as optional.

### File 2: `supabase/functions/_shared/generateCampaignCore.ts`

**Reference-first rule (lines 1017-1020)**: Strengthen the existing rule with an explicit override clause:

"This rule overrides any personalization guidance in the Liquid reference docs below. If the reference shows no first-name personalization, do NOT add it -- even if the Liquid reference suggests using it. The reference layout is the single source of truth for what dynamic elements to include."

Add a new sub-rule about fallback grammar safety:

"FALLBACK GRAMMAR RULE: If you do include first-name personalization, the |default: fallback must produce a grammatically correct sentence. 'Hi {{ person.first_name|default:\'Friend\' }},' is safe. But 'Still interested, {{ person.first_name|default:\'there\' }}?' is NOT safe because 'Still interested, there?' reads as broken English. For inline name usage, use a conditional: {% if person.first_name %}Still interested, {{ person.first_name }}?{% else %}Still interested?{% endif %}"

## Files to modify

1. `supabase/functions/_shared/klaviyoBestPractices.ts` — Remove "always use first_name" directives, add grammatical safety guidance for fallbacks
2. `supabase/functions/_shared/generateCampaignCore.ts` — Strengthen reference-first rule to explicitly override embedded docs, add fallback grammar rule

