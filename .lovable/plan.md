
Goal: fix two linked issues so the chat never re-exposes hidden AI prompts after reload, and multi-element ideate/swap truly behaves as a grouped edit instead of collapsing to headline-only options.

What I found
- The refresh bug is real: the UI shows a clean local bubble, but the backend still saves the raw hidden prompt into `chat_messages.content`. On reload, the page restores that raw content.
- The current cleanup fallback is too narrow. It only strips a few prefixes, so prompts like `[Ideate request on ...]`, `Primary element HTML:`, and grouped region payloads can still leak through.
- Grouped ideate is only half-implemented:
  - `triggerSelectedElementIdeate` tries to ask for grouped `items`, but
  - `handleCommentIdeate` / `handleCommentSwap` still say “this specific element” even for regions,
  - and the `edit-campaign` system prompt only documents flat variants, so the model is being steered back toward single-field output.
- Group apply/preview is not truly atomic yet. It currently replaces whatever item matches and silently skips misses, which breaks the “treat this as one cohesive group” behavior.

Implementation plan

1. Make hidden prompts refresh-proof
- Keep using clean chat bubbles in the UI, but persist both values:
  - visible display text
  - hidden raw prompt
- Use the existing `tool_calls` JSON field on user chat rows for the hidden prompt metadata, so no schema change is needed.
- Update the send flow so:
  - AI still receives the raw prompt
  - chat history stores clean visible text in `content`
  - raw prompt is stored in metadata for internal reuse only
- Update message restore logic so user messages can rehydrate a `hidden_content` value from metadata.

2. Close the leak for old and edge-case messages
- Strengthen `cleanUserMessage` so legacy rows never show raw targeting/HTML blocks, even if they were already saved before the fix.
- Cover all hidden-prompt prefixes, including ideate/swap/comment region payloads and `Primary element HTML`.
- For legacy saved messages, render a safe fallback label instead of raw internals when needed.

3. Unify grouped prompt building across edit mode and comment mode
- Create one shared prompt-builder for single vs grouped element targeting.
- Use it for:
  - selected-element hotkey ideate/swap
  - comment-mode ideate/swap
- For grouped selections, the prompt should explicitly say:
  - these elements are one contextual group
  - every option must replace all selected elements together
  - output must use grouped variants with an `items` array
  - each item should map to the correct field type (headline, subheader/body, CTA, image, etc.)
- Remove the current “specific element only” wording from grouped comment-region prompts.

4. Teach the backend grouped variant mode explicitly
- Update `supabase/functions/edit-campaign/index.ts` system instructions so variant mode supports two legal shapes:
  - single option: `find` / `replace`
  - grouped option: `items[]`
- Add a hard rule: if the request targets multiple elements, do not return headline-only variants.
- Require each `items[]` entry to include:
  - exact live `find`
  - `replace`
  - `label`
  - `preview`
- Keep the grouped option cohesive so headline/subheader/CTA tone changes stay aligned.

5. Make grouped preview/apply truly atomic
- Replace the current best-effort loop with a grouped resolver that:
  - validates all items in the group
  - previews/applies only if the whole group can be resolved
  - aborts with a visible error if part of the group can’t be matched
- Track grouped live replacements in variant metadata so hover/apply can keep working after one grouped option has already been applied.
- Use that same live-target resolution for switching between grouped options, so they behave “just like normal” instead of only working once from the original state.

6. Preserve hidden prompts for “Generate More”
- Right now “Generate More” looks backward through visible messages, which loses the real grouped prompt.
- Update it to prefer the stored hidden prompt metadata, so follow-up generation keeps the full group context instead of using the shortened display bubble.

Files to update
- `src/pages/CampaignEditor.tsx`
  - persist/display hidden vs visible message text correctly
  - improve legacy message cleaning
  - unify grouped prompt creation
  - fix comment-mode grouped ideate/swap
  - make grouped preview/apply atomic
  - use hidden prompt metadata for “Generate More”
- `src/lib/types.ts`
  - extend chat/variant local types for hidden prompt metadata and grouped live-target tracking
- `supabase/functions/edit-campaign/index.ts`
  - add first-class grouped variant schema/instructions
  - store visible content + hidden prompt metadata for user rows

Technical details
```text
User action
  -> UI builds:
       visible_text = clean label shown in chat
       hidden_prompt = full targeting/context payload for AI
  -> backend receives hidden_prompt for generation
  -> chat row stores:
       content = visible_text
       tool_calls.hidden_prompt = hidden_prompt
  -> reload restores visible text only
  -> "Generate More" reuses hidden_prompt, not the bubble text
```

Validation checklist
- Refresh after ideate/swap/comment and confirm no raw HTML/targeting prompt ever appears
- Test legacy saved messages and confirm they render safely
- Select headline + subheader + CTA, press ideate, and confirm each option card contains all three fields as one grouped option
- Hover grouped cards and confirm preview updates all selected elements together
- Click grouped cards and confirm apply updates all targeted elements together or fails atomically
- Run the same grouped flow in comment mode, not just edit-mode selection
