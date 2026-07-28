# Image-Slice Email Generator

Pure image-based emails. Every email is a vertical stack of 3–6 image slices, each one a fully rendered ~600–1080px-wide PNG (hero, story, benefit grid, testimonial, offer, footer, etc.). Every slice is one clickable link. No HTML text, no live buttons. All copy, product treatment, palette, and type are baked into the image.

Think Higgsfield / static-ad generator, but the AI plans a coordinated **series** of sibling images that share one design system so they stack into a coherent email — exactly like the Misfits, Optimite, and Health Nag references.

## Core mental model

```text
Brief ─► Design System (locked once)
         palette, type pair, product treatment,
         background/mood, mockup style, brand voice
         │
         ▼
       Slice Plan (locked once)
         [hero, story, 3-benefit-grid, testimonial, offer-CTA, footer]
         │
         ▼
       Parallel GPT Image 2 generation with:
         - locked design system in every prompt
         - locked previous-slice reference images (visual continuity)
         - slice-specific composition brief
         │
         ▼
       6 sibling PNG slices → stitched preview → export
```

The critical difference from a normal ad generator: **cross-slice visual coherence is a first-class requirement**. Every slice must feel like it came from the same designer's hand on the same afternoon. We enforce this by (a) locking a machine-readable design system before generation, (b) passing prior slices as image references to each subsequent slice, and (c) using a shared master prompt fragment prepended to every slice.

## Two-phase generation

### Phase 1 — Design System Lock
Single call, Claude Opus 4.7, produces a JSON design system:
- `palette`: 4–6 hex values with semantic roles (bg, accent, text, highlight)
- `typography`: heading style, body style, weight/tone description
- `product_treatment`: e.g. "product boxes stacked at 15° with rim light, no shadows on transparent background"
- `mood`: sensory description (Misfits = "sugar rush, arcade energy", Health Nag = "clean pharmaceutical, cool blues, floating capsules")
- `mockup_style`: "editorial magazine spread", "collage cutout", "3D render clay", etc.
- `background_treatment`: solid color / gradient / photographic / textured
- `brand_voice`: 1-line copywriting tone
- `slice_shape_language`: how sections divide (wavy cutouts vs hard geometric bands vs floating cards)

### Phase 2 — Slice Plan
Same call returns an ordered slice array, each slice with:
- `slice_type` (hero, story, benefit_grid, testimonial, offer, product_spotlight, footer, etc. from a curated taxonomy of ~30 email slice archetypes)
- `aspect_ratio` (1:1, 4:5, 3:4, 3:2, etc.)
- `headline_copy`, `body_copy`, `cta_label` (baked into image)
- `composition_brief` (what the image should show visually)
- `cta_url` (the href the entire slice links to)

Slice count is AI-decided based on brief complexity, typically 3–7.

## Phase 3 — Image Generation

For each slice, in parallel (concurrency 3):

1. Build the prompt = master fragment (design system JSON rendered as prose) + slice composition brief + slice copy verbatim + "generate as a complete finished ad slice ready to publish, all text pixel-perfect".
2. Pass reference images: brand product assets + previously-generated slices from this email (for slices 2+).
3. Call **Lovable AI Gateway** with `openai/gpt-image-2`, streaming, `partial_images: 1`, `quality: high`.
4. Stream partials to the UI (blurred on partial, sharp on complete).
5. Upload the final PNG to `campaign-slices` storage bucket.

Reference-image feedback loop is what makes sibling slices coherent. Slice 3 sees slices 1 and 2 as visual anchors and is told: "match this visual system exactly — same palette, type, product treatment, mood".

## Phase 4 — Assembly & Klaviyo Export

Stitch slices in the editor: preview iframe stacks `<a href><img></a>` per slice. When user hits "Push to Klaviyo":
- POST `/api/templates` with `editor_type: "SYSTEM_DRAGGABLE"` and a `definition` containing one `image` block per slice (each with `href` and `alt_text`), no button/text blocks.
- Optionally POST `/api/campaign-message-assign-template` to attach to a campaign send.

Klaviyo image blocks are the only block type we need — the entire visual is the image. This is well within Klaviyo's documented `SYSTEM_DRAGGABLE` block palette.

## Editor UX

New `ImageCampaignEditor` page (`/brands/:brandId/campaigns/:campaignId` with `campaign_mode: "image"`):

- **Left rail (30%)**: brief input, design system chips (palette swatches, font names, mood — all editable, re-lock re-runs Phase 1 for future regens), slice list with reorder handles.
- **Center (50%)**: live stitched preview at 600px width, each slice framed with hover controls (regenerate, edit copy, change CTA URL, delete, insert-slice-below).
- **Right rail (20%)**: per-slice inspector — copy fields, CTA URL, aspect ratio, composition brief. Editing any field + hitting "regenerate this slice" runs a single Phase 3 call with the locked design system.

Slice regeneration always preserves the design system and passes sibling slices as references, so a re-rolled slice still fits.

## Slice archetype library (seeded)

~30 curated archetypes drawn from the taxonomy research (hero, product hero, lifestyle hero, quote hero, split hero, single-product spotlight, 2-up/3-up/4-up product grid, percent-off, BOGO, free-shipping bar, countdown, code reveal, single testimonial, testimonial grid, UGC grid, press logos, star rating, editorial split, brand story, founder note, step-by-step, benefits grid, before/after, comparison, category tiles, shop-the-look, back-in-stock, gift guide, footer). Each archetype stores: default aspect ratio, composition prompt template, whether copy has a CTA, typical role in email flow. These bias the AI's slice plan but don't constrain it.

## Data model

New tables:

- `email_slice_archetypes` (seeded, ~30 rows): `slug`, `category`, `label`, `default_aspect_ratio`, `composition_template`, `role_hint`.
- `campaign_slices`: `id`, `campaign_id`, `position`, `archetype_slug`, `image_url`, `headline_copy`, `body_copy`, `cta_label`, `cta_url`, `aspect_ratio`, `composition_brief`, `prompt_used`, `generation_status` (pending/generating/complete/failed), `created_at`.

Extend `campaigns`:
- `campaign_mode` enum accepts `"image"`.
- `design_system` jsonb — the Phase 1 lock.
- `slice_plan` jsonb — the Phase 2 plan (source of truth; `campaign_slices` rows are the materialized results).
- `klaviyo_template_id` text — set after push.

New storage bucket: `campaign-slices` (public).

## New edge functions

1. `plan-image-email` — Phase 1+2. Claude Opus 4.7, takes brief + brand context + optional reference emails, returns `{design_system, slice_plan}`.
2. `generate-slice` — Phase 3. Streams GPT Image 2 with the master prompt + prior-slice references. One call per slice.
3. `push-to-klaviyo-template` — assembles Klaviyo `SYSTEM_DRAGGABLE` definition (all image blocks) and POSTs to `/api/templates`.
4. `assign-template-to-campaign` — thin wrapper around Klaviyo's `campaign-message-assign-template`.

## Klaviyo integration

Uses existing Klaviyo connection from `KlaviyoSetup`. If brand isn't connected, push is disabled with a link to Integrations. Confirmed capabilities from research:

- `POST /api/templates` with `editor_type: "SYSTEM_DRAGGABLE"`, revision `2026-07-15` — GA.
- `image` block accepts `href`, `alt_text`, `src`, `width`, `height` — everything we need.
- 1,000-template cap per account (we'll surface a warning as user approaches it).

## Out of scope (this pass)

- Baked-in animation / video slices.
- Hotspot regions (user chose single-link-per-slice).
- Live HTML text overlays.
- Block Library / reusable-slice mode (defer until this generator is proven).
- Klaviyo Universal Content push (only meaningful once we have a reusable-slice mode).

## Sequencing

1. Migration + storage bucket + seed `email_slice_archetypes`.
2. `plan-image-email` edge function.
3. `generate-slice` edge function + streaming client helper.
4. `ImageCampaignEditor` page with live stitched preview and per-slice controls.
5. Mode picker tile "Image Email" + route wiring.
6. `push-to-klaviyo-template` + `assign-template-to-campaign`.
