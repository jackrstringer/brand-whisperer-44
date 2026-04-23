
Goal: fix the real shared generation failure, make flow logic less dumb, restore a proper right-side AI chat rail, and let message nodes expand to show the actual brief.

Findings
- The immediate failure is not “flow-specific.” Both normal campaigns and flow emails go through `supabase/functions/_shared/generateCampaignCore.ts`.
- The deployed logs show the same hard failure in both paths: Anthropic rejects at least one image because a dimension still exceeds 2000px.
- The current “fix” is incomplete because `capImageDimensions()` only rewrites ImageKit URLs. Any brand/reference slice URL that is not ImageKit-hosted bypasses the cap entirely, so oversized images still get base64-embedded and fail immediately.
- That also explains failures when the user attaches no references: generation still auto-loads brand profile reference slices from `brand_profiles.reference_slice_urls`.
- Conditional splits are currently rendered with a fake heuristic in `SkeletonViewer.tsx` that blindly alternates YES/NO branches after a split. That is why split visuals are wrong.
- Expandable message briefs were never actually wired: `FlowBuilderPage` passes `expandedIndex`/`onToggleExpand`, but `SkeletonViewer` does not use them.
- The chat was not removed from code, but the current post-skeleton UI is a bottom floating dock in `FlowAgentChat.tsx`, not the persistent right-hand rail you want.

Implementation plan

1. Fix the true generation bug at the shared source
- Update `_shared/generateCampaignCore.ts` so every image sent to Anthropic is dimension-normalized, not just ImageKit URLs.
- Add a host-agnostic image preparation step:
  - fetch image
  - inspect actual dimensions
  - if either side exceeds safe limit, downscale before base64 embedding
  - then send the resized payload
- Apply this to:
  - brand profile slices/full images
  - selected reference campaign slices/full images
  - any other image blocks added to the vision payload
- Keep the existing ImageKit rewrite as an optimization, but do not rely on it as the only safeguard.
- Add explicit logging of source type + original dimensions + resized dimensions so future failures are diagnosable instead of opaque.

2. Surface real backend errors to the UI
- Persist the actual generation failure reason instead of only setting `status = "error"`.
- Add user-visible error fields for campaign and flow email generation state, then show them in the flow builder/editor instead of “see backend logs.”
- This will follow your no-fake-success rule and make immediate failures self-explanatory.

3. Make flow strategy smarter: filters first, not repeated purchase splits
- Tighten `flow-agent/index.ts` system prompt so flow-wide logic is expressed in:
  - `[FILTERS]` for entry/profile gating
  - `[EXIT]` for universal flow exit conditions
- Explicitly ban repeated “Placed Order” conditional splits between each message unless there is a true branching strategy that changes downstream content.
- Update the shared flow skill guidance so welcome/post-purchase/etc. default to:
  - one intelligent entry filter set
  - one exit block
  - conditional splits only when there is a meaningful audience/content divergence

4. Replace fake split rendering with a real skeleton graph model
- Stop the current heuristic YES/NO alternation in `SkeletonViewer.tsx`.
- Extend the skeleton format/parser so split nodes carry explicit condition/branch metadata instead of inferred branches.
- Render only branch structures that are actually encoded in the skeleton.
- If a skeleton does not yet specify branch paths, render the split as logic-only instead of fabricating a wrong diagram.

5. Add true message-node expansion for the actual brief
- Wire `expandedIndex` and `onToggleExpand` through `SkeletonViewer`.
- Clicking a message node should expand an inline panel or side detail card showing the real brief fields:
  - timing
  - job
  - subject direction
  - sections
  - notes
  - generation state / linked campaign status
- Reuse saved `flow_emails` edits when present so what you expand is the real working brief, not a guessed summary.

6. Restore the persistent right-side AI chat rail
- Rework `FlowBuilderPage` into a two-pane shell:
  - left: canvas
  - right: always-visible chat rail
- Keep the current centered pre-skeleton experience only for the empty-state if needed, but once a skeleton exists the agent should live permanently in the right rail.
- The rail should support ongoing conversational edits to skeleton, filters, splits, and message briefs while the canvas updates live.

Technical details
- Files likely touched:
  - `supabase/functions/_shared/generateCampaignCore.ts`
  - `supabase/functions/generate-campaign/index.ts`
  - `supabase/functions/generate-campaign-multi/index.ts`
  - `supabase/functions/flow-agent/index.ts`
  - `src/lib/flows/skeletonParser.ts`
  - `src/components/flows/SkeletonViewer.tsx`
  - `src/components/flows/FlowAgentChat.tsx`
  - `src/pages/FlowBuilderPage.tsx`
- Database change likely needed for clear user-facing failure visibility:
  - add last-error fields on `campaigns` and `flow_emails`

Verification
- Normal campaign generation succeeds with no manually attached references.
- Flow message generation succeeds for the same brand.
- Logs show any oversized non-ImageKit references being resized before Anthropic.
- A skeleton with no real branch metadata does not render fake YES/NO paths.
- A skeleton with real split metadata renders correctly.
- Clicking a message node expands the actual brief.
- The AI chat is persistently visible on the right and can drive live skeleton updates.
