

# Campaign Studio — Implementation Plan

## Overview

A three-page MVP for AI-powered email campaign generation. React + Vite frontend with dark theme, Supabase for auth/db/storage, and three Edge Functions calling Anthropic Claude claude-opus-4-6 for brand extraction, campaign generation, and campaign editing.

## Prerequisites

1. **Enable Lovable Cloud** (Supabase) — database, auth, storage
2. **Add ANTHROPIC_API_KEY secret** — needed by all three Edge Functions

## Step 1: Design System & Theme

Update `src/index.css` with the dark theme palette:
- Background: `#0f0f0f`, Surface: `#1a1a1a`, Border: `#2a2a2a`, Accent: `#c8f135`, Text: `#ffffff`
- Set dark mode as default (apply `dark` class to html)
- Linear/Vercel aesthetic: clean, minimal, no decoration

## Step 2: Database Schema

Create migrations for four tables with RLS:

- **brands** — `id`, `user_id` (references auth.users), `name`, `industry`, `created_at`
- **brand_profiles** — `id`, `brand_id` (FK), `system_prompt`, `raw_extraction` (jsonb), `reference_image_urls` (text[]), `created_at`
- **campaigns** — `id`, `brand_id` (FK), `name`, `brief`, `goal`, `html`, `html_history` (jsonb), `status`, `created_at`, `updated_at`
- **chat_messages** — `id`, `campaign_id` (FK), `role`, `content`, `created_at`

RLS policies: users access only their own brands and related data (join through brands.user_id).

Create a Supabase Storage bucket `brand-references` for uploaded campaign images.

## Step 3: Auth

Add a simple auth gate — login/signup page using Supabase Auth (email/password). Redirect unauthenticated users. Minimal UI consistent with the dark theme.

## Step 4: Supabase Client & Types

Generate TypeScript types from the schema. Configure the Supabase client in `src/integrations/supabase/`.

## Step 5: Page 1 — Brand Setup (`/brands/new`)

Two-step flow:

**Step 1 — Upload references:**
- Large drag-drop zone (JPG/PNG/PDF/HTML), thumbnail grid with remove buttons
- File counter, "Analyze Brand" button disabled under 3 uploads
- On click: uploads images to Supabase Storage, converts to base64, invokes `extract-brand` Edge Function
- Animated progress bar cycling through status messages

**Step 2 — Review extracted profile:**
- Four editable cards: Colors (5 swatches + color picker), Typography (font names + preview), Layout (width/padding/radius), Voice (tone/headline/urgency)
- Yellow "Needs review" badges on low-confidence fields
- "Save Brand" button saves to `brands` + `brand_profiles`, navigates to `/brands/[id]`

## Step 6: Page 2 — Campaigns List (`/brands/:brandId`)

- Header: brand name + "New Campaign" button
- Table/list of campaigns: name, status badge (draft/generating/ready/exported), date, "Open" button
- Empty state with CTA
- Status badges color-coded with accent color

## Step 7: Page 3 — Campaign Editor (`/brands/:brandId/campaigns/:campaignId`)

Full-height layout, no outer scroll.

**Top bar:** Back arrow, inline-editable campaign name (save on blur/Enter), status badge, desktop/mobile toggle (600px / 375px iframe), "Export HTML" button

**Left panel (60%):** White-background iframe rendering campaign HTML (sandboxed). Skeleton shimmer while generating. Click inside iframe appends context message to chat.

**Right panel (40%):**
- *Draft state:* Brief form (textarea, goal select, optional copy textarea, "Generate Campaign" button) → invokes `generate-campaign`
- *Ready state:* Chat interface with user/AI/system message bubbles, multiline input + send button, "Undo" button after AI edits → invokes `edit-campaign`

## Step 8: Edge Function — `extract-brand`

- Receives base64 images, brand name, industry
- Calls Claude claude-opus-4-6 with all images as vision inputs + the extraction system prompt (as specified)
- Generates structured JSON extraction + system_prompt string
- Uploads reference images to Supabase Storage, saves CDN URLs
- Saves to `brand_profiles` table
- Returns `{ extraction, system_prompt }`
- Proper error handling: returns HTTP error status + message, never fake data

## Step 9: Edge Function — `generate-campaign`

- Fetches brand profile (system_prompt, raw_extraction, reference_image_urls)
- Fetches reference images from CDN URLs, passes as vision inputs
- Calls Claude claude-opus-4-6 with three-part prompt: universal HTML skeleton rules (system), reference images + brand rules + campaign brief (user)
- Saves HTML to campaigns table, sets status to `ready`
- Returns `{ html }`
- On failure: sets status to `error`, returns error message

## Step 10: Edge Function — `edit-campaign`

- Fetches campaign + brand profile + top 3 reference images
- Calls Claude claude-opus-4-6 with abbreviated skeleton rules + brand rules + current HTML + change request
- Appends previous HTML to `html_history`, updates `html`
- Saves chat messages (user + assistant) to `chat_messages`
- Returns `{ html }`
- On failure: does NOT update HTML, returns error for display as system chat message

## Step 11: Routing

Update `App.tsx` with routes:
- `/` → redirect to `/brands/new` or brand list
- `/login` → auth page
- `/brands/new` → brand setup
- `/brands/:brandId` → campaigns list
- `/brands/:brandId/campaigns/:campaignId` → campaign editor
- `*` → 404

## Technical Details

- **AI calls**: All Anthropic API calls happen server-side in Edge Functions using the `ANTHROPIC_API_KEY` secret. Vision inputs sent as base64 image content blocks.
- **Undo**: `html_history` is a jsonb array; undo pops the last entry and restores it as current HTML.
- **Export**: Client-side download of `campaigns.html` as a `.html` file using Blob + download link.
- **Iframe sandbox**: `sandbox="allow-same-origin"` — no script execution.
- **Error handling**: All API errors surface as toast notifications or red system messages in chat. Never swallow errors or return mock data.

## Implementation Order

The build will proceed in roughly this order: theme → database/auth → brand setup page → campaigns list → campaign editor → edge functions (extract → generate → edit) → wiring everything together.

