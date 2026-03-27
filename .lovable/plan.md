
What I found (from logs + code)
1) This is not an AI-generation timeout.
- Edge logs show the model finished quickly: `AI stream: 7862ms`.
- Logs also show valid variant output: `Variant mode: 4 variants` and `<variants>` present in `fullText preview`.

2) The request fails during stream finalization, after variants are generated.
- Edge log error: `TypeError: The stream controller cannot close or enqueue` in `edit-campaign`.
- In code, variant path calls `ctrl.close()` and returns, but `finally` also calls `ctrl.close()` again.
- That double-close pattern matches this exact runtime error and can cause the stream to terminate unreliably from the browser’s perspective.

3) Why it looked like “stuck then dropped” in UI.
- Session replay shows user message + thinking indicator, but no variant cards rendered.
- Client only renders variant cards on `event: variants`.
- If stream termination is faulty, client may never process final event blocks (or exits without actionable event), then `finally` resets sending state, so it looks like the process silently died.

4) There is also a schema mismatch that weakens variant persistence.
- Function writes `tool_calls` on `chat_messages`, but DB `chat_messages` has no `tool_calls` column.
- This likely does not cause the immediate streaming crash, but it breaks reliable storage/reload of variant metadata and should be fixed.

Most likely root cause
- Primary: SSE lifecycle bug in edge function (double close / unsafe enqueue/close ordering).
- Secondary: client SSE parser is fragile at end-of-stream (doesn’t process leftover buffer on `done`), so final events can be missed if stream ends abruptly.
- Tertiary: missing `tool_calls` column makes variant state persistence inconsistent.

Fix plan (for your senior engineer)
P0 (stability, must do first)
1) Harden stream lifecycle in `supabase/functions/edit-campaign/index.ts`.
- Remove manual `ctrl.close()` from early variant branch OR guard with `isClosed` flag.
- Add `safeEmit` and `safeClose` helpers:
  - no `enqueue` after close
  - no double close
- Ensure only one close path executes.

2) Keep variant response contract simple and deterministic.
- On variant mode: emit only `variants` then terminal `done` (or just `variants` with terminal flag), but do not interleave risky extra operations after close.
- Add explicit logs before each terminal emit: `"emitting variants"`, `"emitting done"`.

P1 (client robustness)
3) In `CampaignEditor` SSE loop, on `reader.read().done === true`, parse any remaining `buffer` before exiting.
- Prevent dropping last SSE block if stream closes without extra chunk.
- Add fallback: if no `variants`/`done` received but stream ended, append a system error message.

4) Add request-level timeout/failure UX on client.
- If no SSE events for N seconds while `sending`, show “Still processing…” + retry action.
- On terminal failure, always show an explicit error bubble.

P1 (data consistency)
5) Align `chat_messages` schema with code.
- Either add `tool_calls jsonb` migration, or remove all `tool_calls` writes and store variant payload elsewhere.
- Right now code assumes this column exists in both read and write paths.

Technical evidence snapshot
- `edit-campaign` logs:
  - `Prep: ...`
  - `AI stream: 7862ms`
  - `fullText preview: <response>...<variants>...`
  - `Variant mode: 4 variants`
  - then `TypeError: The stream controller cannot close or enqueue`
- Network:
  - `POST /functions/v1/edit-campaign` returns HTTP 200 with streaming body (so request starts correctly).
- Session replay:
  - thinking state appears, then no variant cards, then UI returns to idle without usable result.

Verification plan after fixes
1) Ask: “Give me four new options for the language in the first CTA.”
2) Confirm in logs:
- variant mode detected
- variants emitted
- done emitted
- no stream controller error
3) Confirm in UI:
- variant cards always appear
- no orphaned loading bubble
- no silent drop after waiting.
4) Refresh page and confirm variant state persists correctly (if `tool_calls` schema fixed).
