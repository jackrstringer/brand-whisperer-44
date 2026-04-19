
Goal: make brand analysis reliable on `/brands/new`, fail loudly when backend processing breaks, and stop the endless spinner.

What I found
- `/brands/new` is still using the old `src/pages/BrandSetup.tsx` pipeline instead of the newer DB-polled processing components.
- The current new-brand flow still uses fake/proxy progress timers and a manual `fetch()` stream for `extract-brand` guide mode.
- In `BrandSetup.tsx`, the guide request does not check `guideResponse.ok`; 400/500 responses can be treated like an expected stream end, so the UI keeps polling/spinning instead of surfacing the real error.
- The latest backend logs only show `[extract-brand] Call 1: Generating spec...` and never show the later “spec saved”/guide-success path, so the spec phase is failing or never completing cleanly.
- Session replay confirms the UX bug: the app shows “Failed to send a request to the Edge Function” but remains in the long-running analysis screen.

Implementation plan

1. Replace the legacy `/brands/new` processing flow with the real state-machine flow
- Refactor `src/pages/BrandSetup.tsx` to stop doing the full spec+guide orchestration inline.
- After audit completes, create the brand/profile row, set `processing_status`, fire `extract-brand` with `step: "spec"` in fire-and-forget mode, and hand off to `BrandProcessingScreen` / `ProcessingStatusPanel`.
- Remove the old fake-timer “Deep Brand Analysis” screen logic from `BrandSetup.tsx` so progress is driven by backend state only.

2. Fix the backend contract in `extract-brand`
- Harden `supabase/functions/extract-brand/index.ts` so spec failures always persist `processing_status: "failed"` and a clear `processing_error`.
- Add stricter validation around the spec call:
  - fail on bad API responses
  - fail on parse failures
  - fail if `raw_extraction` write does not succeed
- Improve the guide-mode missing-extraction error so it records the exact stage/last known status instead of just returning bare `No extraction found`.

3. Remove the bad guide invocation path from the new-brand flow
- Stop using direct `fetch()` streaming inside `BrandSetup.tsx` for guide generation.
- Use the same pattern as the newer processing components: DB polling drives the phase transition, and the guide step is invoked only after `processing_status === "spec_complete"`.
- This avoids the current race/transport ambiguity and makes the page resumable.

4. Make failures visible instead of bouncing the user back into confusion
- In `BrandSetup.tsx`, replace the current “toast + back to uploads” failure behavior with a persistent failed state:
  - show the backend error inline
  - offer retry
  - preserve uploaded files and audit data
- Reuse the log/phase UI already present in `BrandProcessingScreen.tsx` so users can see whether it failed in audit, spec, or guide.

5. Tighten `ProcessingStatusPanel` and brand resume behavior
- Make sure the new-brand route uses the same polling behavior already used on the Brand page.
- Keep the existing resumable behavior on `src/pages/BrandProfile.tsx`, but ensure the failure copy is explicit and actionable.
- If the spec phase never leaves `running_spec` or returns to idle unexpectedly, fail loudly with a diagnostic message rather than waiting indefinitely.

Files to update
- `src/pages/BrandSetup.tsx`
- `src/components/brand/BrandProcessingScreen.tsx`
- `src/components/brand/ProcessingStatusPanel.tsx`
- `supabase/functions/extract-brand/index.ts`

Expected result
- Brand analysis on `/brands/new` uses one consistent backend-driven pipeline.
- If spec fails, the user sees that it failed in spec, with the real error.
- If guide cannot start because extraction is missing, that becomes an explicit failed state, not an endless spinner.
- Users can leave and return to the Brand page and still see live processing status.

Technical notes
- No database migration is required for this fix; `brand_profiles.processing_status` and `processing_error` already exist.
- The main architectural issue is not the table schema; it is that `/brands/new` is still on the old orchestration path while the rest of the app already has a better state-machine pattern.
- I would keep the zero-fallback rule: no fake success, no silent stream-timeout masking, no auto-recovery that hides backend failures.
