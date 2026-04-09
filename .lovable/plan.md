

# Admin Generation Timeline — Detailed Run Inspector

## What This Does
Adds an admin-only "Run Details" button to the campaign editor header bar. Clicking it opens a full-screen dialog showing a chronological timeline of everything that happened during the campaign's last generation run: every pipeline step, what was sent, what came back, screenshots, slices, prompts, errors, and timing.

## Current State
- Pipeline steps use `console.log` in edge functions — no structured storage
- The client-side QA loop (`runVisualQa`) tracks steps ephemerally in memory
- No way to inspect what happened after the fact
- Edge function logs exist in Supabase analytics but are unstructured text

## Architecture

### 1. New `generation_events` table

```sql
CREATE TABLE generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  step text NOT NULL,          -- e.g. 'generation_start', 'variant_0_claude_call', 'screenshot', 'slice', 'qa_compare', 'qa_patch', 'qa_edit', 'qa_result'
  status text NOT NULL DEFAULT 'started',  -- 'started', 'completed', 'failed'
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  payload jsonb,               -- inputs: prompt snippets, image URLs, config
  result jsonb,                -- outputs: response data, scores, issues
  error text,
  created_at timestamptz DEFAULT now()
);

-- RLS: admin read-only, service_role write
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view generation events"
  ON generation_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access"
  ON generation_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 2. Instrument the Pipeline

Add event logging calls at each major step. Uses the existing `supabase` service-role client already available in edge functions.

**In `generate-campaign-multi/index.ts`:**
- `generation_start` — campaign ID, variant count, mode, references
- `variant_N_start` / `variant_N_complete` / `variant_N_error` — per-variant with timing, html length, error

**In `generateCampaignCore.ts`:**
- `skeleton_extract` — reference skeleton analysis (input images, output JSON)
- `claude_generate` — the main Claude call (prompt length, model, token usage, response length)
- `image_rehost` — ImageKit rehosting results
- `finalize_html` — finalization step
- `klaviyo_validate` — template validation attempts (for flow emails)

**In `CampaignEditor.tsx` (QA loop):**
- `qa_flow_render` — Liquid rendering with event data
- `qa_screenshot` — screenshot capture (image dimensions, base64 length)
- `qa_slice` — slicing results (slice count, slice URLs/dimensions)
- `qa_compare` — Claude QA comparison (reference slices count, output slices count, score, issues)
- `qa_patch` — find/replace patches applied
- `qa_edit` — Agent 2 edit call
- `qa_result` — final outcome (passed/needs_review/error, score, iteration count)

Each event is a single insert. For long-running steps, we insert on start (status: 'started') and update on completion (status: 'completed', duration_ms, result). This gives real-time visibility even while generation is running.

### 3. Logging Helper

A lightweight helper used by both edge functions and the client:

```typescript
// Edge function version (service role client)
async function logGenEvent(supabase, campaignId, step, data) {
  await supabase.from('generation_events').insert({
    campaign_id: campaignId,
    step,
    status: data.status || 'completed',
    payload: data.payload || null,
    result: data.result || null,
    error: data.error || null,
    duration_ms: data.duration_ms || null,
    completed_at: data.status === 'started' ? null : new Date().toISOString(),
  });
}
```

### 4. Admin UI — Run Details Dialog

**Button placement:** In the campaign editor top bar, after the view settings popover and before "Export HTML". Only visible when `isAdmin` is true. Uses a `Bug` or `Activity` icon.

**Dialog content:** A full-width dialog (`max-w-4xl`) with:
- **Header:** Campaign name, generation timestamp, total duration
- **Timeline:** Vertical timeline of events, each showing:
  - Step name + status badge (started/completed/failed)
  - Timing (started_at, duration)
  - Expandable payload section (collapsible JSON viewer for prompts, configs)
  - Expandable result section (scores, issues, HTML snippets)
  - For screenshot/slice steps: inline image thumbnails (clickable to expand)
  - Error messages highlighted in red
- **Filters:** Toggle to show/hide payload details, filter by step type

**Data loading:** On dialog open, fetches all `generation_events` for the campaign ordered by `created_at ASC`. No realtime needed — this is a post-hoc inspection tool.

### 5. Files Modified

| File | Change |
|------|--------|
| **New migration** | Create `generation_events` table with RLS |
| `supabase/functions/generate-campaign-multi/index.ts` | Add event logging for generation lifecycle |
| `supabase/functions/_shared/generateCampaignCore.ts` | Add event logging for Claude calls, rehosting, finalization |
| `src/pages/CampaignEditor.tsx` | Add `useIsAdmin`, admin button, QA loop event logging, dialog |
| `src/components/campaign/GenerationTimeline.tsx` | **New** — Timeline UI component |

### 6. Security
- Table uses RLS: only admins can read, only service_role can write
- Client-side QA logging uses the authenticated user's token — inserts will go through service_role via edge function proxy, OR we add an authenticated admin INSERT policy
- Actually simpler: add an admin INSERT policy too so the client-side QA loop can log directly

```sql
CREATE POLICY "Admins can insert generation events"
  ON generation_events FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));
```

