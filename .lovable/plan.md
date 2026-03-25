
## What I found (root cause)
From the current code + live function logs, the failure is a **revision/schema mismatch**:

- `klaviyo-proxy` is pinned to `revision: 2024-10-15`.
- The campaign payload currently uses the newer `campaign-message.attributes.definition` shape.
- Klaviyo is returning:
  - `'channel' is a required field ... /attributes/channel`
  - `'definition' is not a valid field ... /attributes/definition`

So the function is mixing a **2025-style body** with a **2024 revision**.  
Also, we currently send `Content-Type: application/json` globally, while campaign creation + template assignment should be `application/vnd.api+json`.

---

## Client-side “Approve / Review & Send” flow (current + fix point)
1. In `CampaignEditor.tsx`, **Review & Send** navigates to `/brands/:brandId/campaigns/:campaignId/qa`.
2. In `CampaignQA.tsx`, user edits subject/preview/audience and clicks **Create Klaviyo Campaign**.
3. `pushToKlaviyo("campaign")` invokes `klaviyo-proxy` with campaign HTML + SL/PT + include/exclude IDs.
4. `klaviyo-proxy` runs template create → campaign create → assign template.
5. On success, UI opens returned `klaviyoEditUrl`.

Break is step 4 (campaign payload/header/revision compatibility).

---

## Implementation plan

### 1) Make Klaviyo request layer revision-aware and header-aware
**File:** `supabase/functions/klaviyo-proxy/index.ts`
- Refactor `klaviyoFetch(...)` to accept per-call:
  - `revision`
  - `contentType`
  - `accept`
- Keep defaults, but allow campaign endpoints to explicitly use:
  - `Content-Type: application/vnd.api+json`
  - `Accept: application/vnd.api+json`

### 2) Use endpoint-specific revision compatibility
**File:** `supabase/functions/klaviyo-proxy/index.ts`
- Introduce constants:
  - `TEMPLATE_REVISION = "2025-01-15"` (or unified 2025 revision)
  - `CAMPAIGN_REVISION = "2025-10-15"`
- Apply these per endpoint instead of one global revision constant.

### 3) Fix campaign payload shape by revision (primary + compatibility fallback)
**File:** `supabase/functions/klaviyo-proxy/index.ts`
- Primary create-campaign attempt: 2025 shape + vnd.api+json.
- If Klaviyo returns schema-mismatch hints (channel/definition conflict), retry once with 2024-compatible message shape.
- Preserve 3-step sequence:
  1. create template
  2. create campaign with inline campaign-messages
  3. assign template to campaign message
- Keep message ID extraction from relationships with fallback GET campaign-messages.

### 4) Align drag-and-drop behavior with your working app flow
**File:** `supabase/functions/klaviyo-proxy/index.ts`
- For `create-campaign` template creation, set `editor_type: "USER_DRAGGABLE"` (instead of CODE).
- Keep `create-template` action behavior explicit (can remain CODE unless we intentionally switch it too).
- Return editor URL as:
  - `https://www.klaviyo.com/email-template-editor/campaign/{campaignId}/content/edit`

### 5) Tighten audience validation in QA submit
**File:** `src/pages/CampaignQA.tsx`
- Preflight validation before invoking function:
  - require at least one included audience (and, if we follow your strict flow, enforce segment IDs specifically for campaign creation).
- Keep include/exclude arrays explicit in request body.
- Improve surfaced error messaging from function so pointer/detail is shown directly in toast.

### 6) Improve observability for final debugging
**File:** `supabase/functions/klaviyo-proxy/index.ts`
- Add stage-specific error context:
  - `create-template failed`
  - `create-campaign failed`
  - `assign-template failed`
- Pass through Klaviyo error `detail` + `source.pointer` in function response.

---

## Technical details (concise)
- Current failure is not auth; template creation succeeds.
- Current failure is schema compatibility in campaign step due revision/body mismatch.
- Campaign endpoints should use `application/vnd.api+json`.
- The 3-step flow itself is correct; only payload/header/revision compatibility needs hardening.
- No DB migration needed for this fix.
