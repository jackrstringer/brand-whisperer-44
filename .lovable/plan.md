<final-text>Direct audit: this is not one random bug. The current brand-processing pipeline has multiple concrete reliability faults.

Current mechanical flow
```text
/brands/new
  -> BrandSetup.startAudit()
     -> optional extract-figma + extract-website-fonts
     -> client-side image slicing
     -> audit-brand
     -> generateGuideFromAudit()
        -> create brand + brand_profile + upload refs
        -> fire research-brand
        -> fire asset analysis
        -> extract-brand(step="spec")
        -> extract-brand(step="guide")
        -> poll brand_profiles.brand_guide_html

Brand Intelligence Wizard
  -> research-brand
  -> poll brand_intelligence.research_status
  -> save-brand-survey
  -> compile-brand-context
  -> poll research_status again
```

What is broken right now
1. The exact error you just hit is most likely the `extract-brand` spec request timing out at the browser edge.
   - `src/pages/BrandSetup.tsx` and `src/components/brand/ReanalyzeBrand.tsx` both await `supabase.functions.invoke("extract-brand", { step: "spec" })`.
   - In `supabase/functions/extract-brand/index.ts`, `step="spec"` runs the full Anthropic spec generation synchronously before returning.
   - Your logs already show the proof: the function logged `Spec saved for brand ...` and then `Http: connection closed before message completed`.
   - So the backend work completed, but the browser-held request died before the response finished. That is why you saw “Failed to send a request to the Edge Function”.

2. The guide step is architecturally unreliable.
   - In the same `extract-brand` function, the guide path starts a promise and immediately returns, but it does not use `EdgeRuntime.waitUntil(...)`.
   - That means the runtime can tear down the request before the background guide job finishes.
   - This explains the earlier “it just stopped” behavior.

3. Brand research status is invalid at the database layer.
   - `supabase/functions/research-brand/index.ts` writes `research_status: "researching"` and later `research_status: "failed"`.
   - But the database trigger in `20260407064336_d5d5b3fc...sql` only allows:
     `pending | ai_complete | survey_complete | complete`
   - So the UI and the database disagree on what states are legal.
   - Worse: `runResearch()` writes `researching` before its own try/catch, so that initial status write can fail before the job even really starts.

4. The survey compile flow contains a fake-success path.
   - In `src/components/brand/BrandIntelligenceWizard.tsx`, `submitSurvey()` sets phase `"done"` if `attempts > 60`, even when `research_status !== "complete"`.
   - So the UI can report success without the backend ever finishing.
   - That directly violates your “no graceful fake success” requirement.

5. Critical errors are stored in the wrong place.
   - `extract-brand` writes failures into `brand_profiles.audit_findings._error`.
   - The UI polls that magic JSON key to infer failure.
   - Runtime state should not be hidden inside a content blob.

6. Parsing is still brittle in critical AI calls.
   - `audit-brand` still does naive regex JSON extraction and direct `JSON.parse`.
   - `research-brand` also does best-effort parsing but no strong truncation guard.
   - `extract-brand` checks truncation for spec, but not the guide HTML response.
   - So malformed/truncated model output can still break the pipeline.

7. There is a fidelity inconsistency in the audit input.
   - Initial setup slices audit images at width `600` in `BrandSetup.tsx`.
   - Reanalysis slices at `900` in `ReanalyzeBrand.tsx`.
   - So first-pass audit and reanalysis are not using the same visual detail level.

Implementation plan
1. Fix the state model first
   - Create a migration that updates brand-intelligence status validation to allow the states the code actually uses: `researching`, `compiling`, and `failed`.
   - Add explicit error/status fields instead of encoding failures inside JSON blobs.
   - For the guide flow, add explicit processing columns on `brand_profiles` (or one unified processing status/error pair) so the UI can poll real state.

2. Make brand guide generation a true background job
   - Refactor `extract-brand` so the browser never waits on a full Anthropic call.
   - Use `EdgeRuntime.waitUntil(...)` for the long-running work.
   - Best fix: collapse spec + guide into one “start brand processing” job that:
     - marks status `running_spec`
     - saves spec
     - marks status `running_guide`
     - saves guide
     - marks status `complete` or `failed`
   - Return immediately from the HTTP request with “job accepted”, then let the UI poll persisted status.

3. Update the UI to poll explicit status, not inferred HTML/json hacks
   - `BrandSetup.tsx` and `ReanalyzeBrand.tsx` should poll the new processing status/error fields.
   - Stop polling only for `brand_guide_html`.
   - If status becomes `failed`, show the exact saved backend error.
   - If status times out, show a timeout error but do not pretend success.

4. Fix research + survey compile orchestration
   - Move `research-brand` status writes fully inside a safe try/catch.
   - Save a real error field on failure.
   - Make `save-brand-survey` kick off `compile-brand-context` via a real background pattern (`waitUntil`) or a single owned orchestration path.
   - Add an explicit `compiling` status and `failed` status for this phase too.

5. Remove fake-success behavior
   - Delete the `attempts > 60 => done` branch in `BrandIntelligenceWizard.tsx`.
   - Completion should happen only when the backend writes `complete`.
   - If compile fails or times out, keep the user in an error state with a visible message.

6. Harden AI response handling
   - Add truncation detection and robust parsing to `audit-brand` and `research-brand`.
   - Add `stop_reason` checking to the guide generation call in `extract-brand`.
   - Fail loudly with a descriptive message instead of half-saving broken output.

7. Normalize audit input quality
   - Pick one slice width for all audit paths and use it consistently.
   - If you want the high-fidelity path, normalize setup and reanalysis to the same width and let the server-side slice cap handle payload limits.

Validation plan
1. New brand flow
   - Start a fresh brand with website + 3 images.
   - Verify:
     - audit finishes
     - brand/profile rows are created
     - processing status advances through spec -> guide -> complete
     - UI reaches guide review without any open long-running edge request failing

2. Forced failure path
   - Trigger one known-bad input or intentionally fail one stage.
   - Verify:
     - status becomes `failed`
     - error field is populated
     - UI surfaces the actual error
     - no screen reports success

3. Brand intelligence flow
   - Start research
   - Verify `researching -> ai_complete` or `failed`
   - Submit survey
   - Verify `compiling -> complete` or `failed`
   - Confirm the UI never advances to done without backend completion

Files that need to change
- `src/pages/BrandSetup.tsx`
- `src/components/brand/ReanalyzeBrand.tsx`
- `src/components/brand/BrandIntelligenceWizard.tsx`
- `src/components/brand/BrandIntelligenceTab.tsx`
- `supabase/functions/extract-brand/index.ts`
- `supabase/functions/research-brand/index.ts`
- `supabase/functions/save-brand-survey/index.ts`
- `supabase/functions/compile-brand-context/index.ts`
- `supabase/functions/audit-brand/index.ts`
- one new migration updating the brand-intelligence status validation and adding explicit processing/error fields

Bottom line
- The failure you just saw is primarily a long-running synchronous `extract-brand` spec call being held open by the browser.
- The broader pipeline is also unreliable because guide generation is not anchored with `waitUntil`, research status values are invalid at the database layer, and the survey compile UI can falsely mark success.
- If the plan above is implemented, the next test should use immediate-ack background jobs, explicit persisted statuses/errors, and no fake-success fallbacks.</final-text>