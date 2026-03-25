
Root cause (from code + docs comparison):

1) The payload sent to `POST /api/campaigns` is not in the format Klaviyo expects for revision `2024-10-15`.
- Current code sends `audiences.included/excluded` as objects like `{ type, id }`, but Klaviyo expects string IDs.
- Current code sends campaign message fields at `attributes.channel/label/content`; Klaviyo expects `attributes.definition.{ channel, label, content }`.
- Current code sends `send_strategy.options_static.datetime = null`, which is an invalid type (expects a datetime string when using static strategy).

This matches the generic error you’re seeing: `invalid field type` at `/data/attributes`.

Implementation plan:

1) Correct campaign payload shape in `supabase/functions/klaviyo-proxy/index.ts`
- Build audiences as string arrays only:
  - `included: string[]`
  - `excluded?: string[]`
- Change message payload to:
  - `"campaign-messages": { data: [{ type: "campaign-message", attributes: { definition: { channel: "email", label, content: { subject, preview_text } } } }] }`
- Replace current static strategy with a valid default draft-friendly strategy:
  - `send_strategy: { method: "immediate" }`
  (or omit strategy entirely; immediate is safest explicit value)

2) Add hard validation before calling Klaviyo
- If no included list/segment is selected, return a clear error before API call:
  - “Select at least one included list/segment.”
- Ensure `subjectLine` and `previewText` are coerced to strings.
- Remove undefined fields from payload before `JSON.stringify`.

3) Keep the multi-step campaign flow, but make it robust
- Step A: create template.
- Step B: create campaign with corrected payload.
- Step C: resolve message ID from campaign relationships (fallback to `/campaigns/{id}/campaign-messages` if missing).
- Step D: assign template via `/campaign-message-assign-template`.
- Step E: patch `/campaign-messages/{id}` with `attributes.definition.content.subject/preview_text` to guarantee SL/PT remain correct after template assignment.

4) Improve error surfacing for faster debugging
- Add stage-specific error context in the edge function:
  - `create-template failed`, `create-campaign failed`, `assign-template failed`, `update-message failed`.
- Return Klaviyo `source.pointer` and `detail` directly in error response so UI toasts are actionable.

5) QA/update the client trigger in `src/pages/CampaignQA.tsx`
- Prevent “Create Klaviyo Campaign” when no included audience is selected; show toast immediately.
- Keep current success behavior (open returned Klaviyo editor URL).
- Ensure request body always sends arrays (never undefined/object-shaped audience items).

Files to update:
- `supabase/functions/klaviyo-proxy/index.ts` (primary fix)
- `src/pages/CampaignQA.tsx` (preflight validation + clearer user feedback)

Technical details:
- Required API corrections:
  - `audiences.included/excluded` => `string[]` IDs only
  - campaign message create shape => `attributes.definition`
  - no `null` datetime in static strategy
- This is why template export works (template payload is correct) while campaign creation fails (campaign payload schema/type mismatch).
