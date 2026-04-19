

## Two real backend failures observed in latest run

### 1. `audit-brand` — JSON parse fails despite balanced braces
- Sonnet returned 28805 chars, **79 open vs 79 close braces** (balanced).
- Current "repair" only handles missing closing braces → throws "Malformed JSON" and gives up.
- The actual cause is one of: (a) a trailing comma, (b) an unterminated/unescaped string inside the JSON, or (c) the `/\{[\s\S]*\}/` regex grabbed too much (greedy match across stray text). With balanced braces, (c) is most likely — the regex is matching from the FIRST `{` in surrounding prose to the LAST `}`, producing a non-JSON envelope.
- Also `max_tokens: 16000` is tight for 8 campaigns; one more campaign and we'd hit the truncation path too.

### 2. `research-brand` — runs in parallel during brand setup, also crashing
- Line 257: `.upsert(...).catch(...)` — Supabase query builders return a thenable, not a real Promise. `.catch` is undefined → uncaught exception kills the worker.
- Also separately fails `JSON.parse` at position 3723 (separate root cause: model emitted invalid JSON; needs a real extractor).

## Fix plan

### A. `supabase/functions/audit-brand/index.ts`
- Bump `max_tokens` from 16000 → 24000 (Sonnet 4.6 supports it; gives headroom for 8+ campaign audits).
- Replace the brittle regex + brace-only repair with a robust extractor:
  1. Strip ```json fences if present.
  2. Find the JSON by walking from the first `{` and tracking brace depth + string state (skipping escaped quotes), stopping at the matching close. This avoids the greedy-regex envelope problem.
  3. If parse still fails, run a small repair pass: trim trailing commas before `}`/`]`, then retry.
  4. If still fails, log a meaningful slice of the candidate around the failure offset (`SyntaxError.message` includes position) and throw — no silent fallback, per project rules.
- Keep the existing `stop_reason === "max_tokens"` loud-fail path.

### B. `supabase/functions/research-brand/index.ts`
- Line 257: remove the bogus `.catch(...)` chain. Use a real `try/catch` around the failure-marker upsert so the background worker can't crash on its own error path.
- Replace the JSON parsing block (lines 208–233) with the same robust extractor from (A) — extracted into a shared helper inline in each file (no new shared module needed; both functions already duplicate other utilities).

### C. No frontend changes
- `BrandSetup.tsx` already surfaces audit errors via the unified progress screen + debug panel. Once the backend stops throwing on parse-able output, the existing UI handles it.

### D. Deploy
- Deploy `audit-brand` and `research-brand`. Report timestamps.

### Out of scope (intentionally)
- No model swap. Sonnet 4.6 is fine here once parsing is robust.
- No prompt rewrite. The prompt is already explicit about "no markdown fences, no commentary."
- No silent fallbacks or fake-success paths — failures still throw loudly with diagnostics.

