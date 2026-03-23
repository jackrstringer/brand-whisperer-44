

# Revamped Brand Onboarding + Campaign Flow

## Overview

Replace the current single-step brand setup with a multi-step guided onboarding quiz. Add structured image asset management with categorized buckets. Auto-generate 3 starter campaigns after brand analysis. Add a feedback/refinement loop. Expand campaign goal types. Allow per-campaign reference uploads.

---

## Database Changes

### New tables

**`brand_assets`** — categorized image storage per brand
- `id` uuid PK
- `brand_id` uuid FK → brands
- `category` text (enum-like: `logo`, `product_imagery`, `hero_shots`, `lifestyle`, `misc`)
- `url` text — ImageKit/storage URL
- `filename` text
- `created_at` timestamptz

**`user_preferences`** — account-wide learned preferences
- `id` uuid PK
- `user_id` uuid (references auth.users)
- `preferences` jsonb — accumulated non-brand-specific preferences
- `created_at` timestamptz
- `updated_at` timestamptz

**`brand_feedback`** — stores feedback responses from the refinement quiz (step 5)
- `id` uuid PK
- `brand_id` uuid FK → brands
- `round` int — feedback round number
- `feedback` jsonb — structured Q&A responses
- `attachment_urls` text[]
- `created_at` timestamptz

### Alter existing tables

**`brands`** — add columns:
- `website_url` text nullable
- `source_types` text[] — which resource types user selected (e.g. `['website', 'past_campaigns', 'brand_deck', 'product_mockups', 'image_assets']`)

**`brand_profiles`** — add column:
- `brand_guide_url` text nullable — uploaded brand deck PDF/image

**`campaigns`** — add column:
- `reference_campaign_ids` text[] nullable — IDs of reference campaigns chosen for this specific campaign

RLS on all new tables: users access only through their own brands (same join pattern as existing tables).

### New storage buckets

- `brand-assets` (public) — for categorized image assets (logos, product shots, lifestyle, etc.)

---

## Step-by-step Flow

### Step 1: Source Selection Quiz (`/brands/new` — first screen)

A clean multi-select quiz: "What would you like to base your email designs on?"

Checkboxes:
1. **Current Website URL** — text input appears for URL
2. **Past Email Campaigns** (recommended badge) — upload zone
3. **Brand Deck / Brand Guidelines** — upload zone (PDF/images)
4. **Outside Misc Branding References** — upload zone
5. **Product Mockups** — upload zone
6. **Image Assets** — expands into sub-categories

When "Image Assets" is selected, show sub-upload zones:
- Logo (transparent bg — light and dark required)
- Misc Product Imagery
- Transparent BG Product Hero Shots
- Lifestyle Imagery

User checks what they have, then proceeds.

### Step 2: Resource Upload Screens (one per selected type)

Paginated screens — one per selected resource type. Each has:
- Title + description of what to upload
- Drag-drop zone (reuse existing component)
- Thumbnail grid with remove buttons
- "Next" / "Back" navigation
- For website URL: just a text input + "Scan" button (future: scrape)
- For image assets: sub-sections for each category within one screen

All uploads go to `brand-assets` table with correct `category`.
Past campaigns go to existing `brand-references` bucket.
Brand deck goes to `brand-assets` with category `brand_deck`.

### Step 3: Brand Analysis (existing logic, expanded)

- Combine all uploaded assets: past campaigns as vision inputs, website screenshot (if URL provided — future), brand deck pages as vision inputs, product/lifestyle images for context
- Call `extract-brand` edge function (expanded to accept categorized assets)
- Show the existing review screen (colors, typography, layout, voice)
- Save everything including categorized asset URLs

### Step 4: Auto-generate 3 Starter Campaigns

After brand save, automatically create 3 campaigns and generate them in parallel:
1. **Welcome Campaign** — goal: `welcome`
2. **Social Proof Campaign** — goal: `social_proof`
3. **General Highlight Campaign** — goal: `highlight`

Navigate to brand's campaign list showing all 3 generating/ready.

### Step 5: Feedback & Refinement Loop

After the 3 campaigns are generated, present a structured feedback flow:
- Show all 3 campaigns in a scrollable preview
- Ask targeted questions:
  - "How do you feel about the overall design direction?" (with thumbs up/down + text)
  - "Any changes to colors or typography?"
  - "How's the copy tone and voice?"
  - "Anything specific you'd like changed?"
- User can attach reference images with each response
- On submit: save to `brand_feedback`, update `brand_profiles.system_prompt` via a new edge function `refine-brand`
- Non-brand-specific preferences (e.g. "I always want buttons larger") save to `user_preferences`
- Can do multiple rounds

### Campaign Creation Enhancements

**Expanded goal types** in the campaign editor:
- Promotional
- Educational
- Re-engagement
- Seasonal
- Welcome
- Social Proof
- Highlight
- Product Launch
- Abandoned Cart
- Win-back
- Newsletter
- Announcement

**Per-campaign reference selection:**
- When creating a new campaign, add a section to:
  - Upload new reference campaigns specific to this email
  - Browse/select from the brand's saved reference library (thumbnails from `brand_assets` + `brand-references`)
- Selected references get passed to `generate-campaign` as additional vision inputs

---

## New/Modified Edge Functions

### `extract-brand` (modify)
- Accept additional input types: `brandDeckImages`, `websiteUrl`, `productImages`, `lifestyleImages`
- Include all image types as vision inputs with labeled context
- Same output format

### `refine-brand` (new)
- Input: `{ brandId, feedback, attachmentUrls }`
- Fetches current `brand_profiles.system_prompt`
- Calls Claude with current prompt + feedback + any attached references
- Returns updated `system_prompt` and saves to DB
- Extracts any account-wide preferences and returns them separately

### `generate-campaign` (modify)
- Accept optional `referenceCampaignUrls` for per-campaign references
- Include them as additional vision inputs alongside brand references

---

## New Pages/Components

1. **`/brands/new`** — Complete rewrite of `BrandSetup.tsx` with quiz flow (steps 1-3)
2. **`/brands/:brandId/onboarding`** — New page for feedback loop (step 5), shown after initial 3 campaigns generate
3. **`CampaignsList.tsx`** — Add reference library browser, show auto-generated starter campaigns
4. **`CampaignEditor.tsx`** — Add reference upload/selection in the brief form, expanded goal dropdown

## Component Breakdown

- `SourceQuiz` — checkbox selection with conditional inputs
- `ResourceUploader` — paginated upload screens per resource type
- `AssetCategoryUploader` — sub-component for image asset categories (logo, product, lifestyle, hero)
- `FeedbackFlow` — structured feedback questions with image attachment
- `ReferenceLibrary` — browse/select from saved brand references
- `CampaignPreviewCard` — compact preview of a campaign for the feedback screen

---

## Implementation Order

1. Database migrations (new tables, altered columns, storage bucket)
2. Source quiz UI + resource upload screens (rewrite BrandSetup)
3. Asset category uploaders with ImageKit hosting
4. Update `extract-brand` to handle all input types
5. Auto-generate 3 starter campaigns after brand save
6. Feedback flow page + `refine-brand` edge function
7. User preferences storage
8. Per-campaign reference selection in editor
9. Expanded campaign goal types
10. Reference library browser component

