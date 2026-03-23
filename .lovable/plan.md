

# Holistic UI Overhaul — Global Nav, Brand Management, Settings

## Overview

Add a persistent sidebar navigation accessible from every page. Add delete/edit capabilities for brands and campaigns. Add brand-level and global settings pages for managing assets, instructions, and QA checklists.

---

## New/Modified Pages & Components

### 1. Global Sidebar (`src/components/AppSidebar.tsx`)

Persistent sidebar using shadcn `Sidebar` component, visible on all authenticated pages:
- **Logo/app name** at top
- **Dashboard** link (all brands)
- **Current Brand** section (when on a brand route) — shows brand name, links to:
  - Campaigns list
  - Brand Settings
- **Global Settings** link — account-wide generation rules & QA checklist
- **Sign Out** button at bottom
- Collapsible via `collapsible="icon"`

### 2. App Layout (`src/components/AppLayout.tsx`)

Wrap all protected routes in a `SidebarProvider` + layout shell:
- Sidebar on left
- `SidebarTrigger` in a thin header bar (always visible)
- Main content area on right

Update `App.tsx` to wrap protected routes in `<AppLayout>` instead of bare `<ProtectedRoute>`.

### 3. Delete Campaigns (`CampaignsList.tsx`)

- Add a trash icon button on each campaign row
- Confirmation dialog before delete
- `supabase.from("campaigns").delete().eq("id", campaignId)`

### 4. Delete Brands (`BrandDashboard.tsx`)

- Add a trash icon button on each brand card
- Confirmation dialog (warns about deleting all campaigns too)
- `supabase.from("brands").delete().eq("id", brandId)` — cascading deletes handle the rest

### 5. Brand Settings Page (`src/pages/BrandSettings.tsx`, route: `/brands/:brandId/settings`)

Tabbed or sectioned page:

**Info tab:**
- Edit brand name, industry, website URL
- Delete brand button

**Assets tab:**
- Shows current assets grouped by category (logo, product_imagery, hero_shots, lifestyle)
- Each category: thumbnail grid with remove buttons + upload button to add more
- Reuse `AssetCategoryUploader` component (modified to show existing DB assets alongside new uploads)

**Instructions tab:**
- Large textarea for "Brand Instructions / Notes / Guidelines"
- Stored in `brand_profiles.system_prompt` as an appended section (or a new `brand_instructions` text column on `brands`)
- These get injected into every campaign generation for this brand
- The system will agentically append to this when users mention rules during campaign editing

**QA Checklist tab:**
- List of QA checklist items specific to this brand
- Add/remove/edit items
- Stored as JSONB array on `brand_profiles` (new column `qa_checklist jsonb default '[]'`)
- These items get appended to the QA pass prompt for this brand's campaigns

### 6. Global Settings Page (`src/pages/GlobalSettings.tsx`, route: `/settings`)

**Generation Rules tab:**
- Textarea for global generation instructions/notes
- Stored in `user_preferences.preferences.generation_rules`
- Injected into every campaign generation across all brands

**QA Checklist tab:**
- Global QA checklist items (apply to all brands)
- Stored in `user_preferences.preferences.qa_checklist`
- Appended to QA pass alongside brand-specific items

---

## Database Changes

### Alter `brand_profiles`
- Add `brand_instructions text nullable` — user-written brand-specific guidelines
- Add `qa_checklist jsonb default '[]'` — array of brand-specific QA items

### Alter `brands`
- Ensure cascading deletes work: campaigns, brand_profiles, brand_assets, brand_feedback all have `ON DELETE CASCADE` on their `brand_id` FK (verify existing FKs)

No new tables needed — `user_preferences.preferences` JSONB already exists for global settings.

---

## Edge Function Updates

### `generate-campaign/index.ts`
- Fetch `brand_profiles.brand_instructions` and `brand_profiles.qa_checklist`
- Fetch `user_preferences.preferences.generation_rules` and `user_preferences.preferences.qa_checklist`
- Inject brand instructions into the generation system prompt
- Inject global generation rules into the generation system prompt
- Append both brand and global QA items to the QA pass prompt

### `edit-campaign/index.ts`
- Same: inject brand instructions and global rules
- When user mentions a new rule during editing (detected by the AI), the edge function appends it to `brand_profiles.brand_instructions` automatically

---

## Route Changes (`App.tsx`)

Add:
- `/brands/:brandId/settings` → `BrandSettings`
- `/settings` → `GlobalSettings`

Wrap all protected routes in `AppLayout`.

---

## Implementation Order

1. Database migration (add columns to brand_profiles, verify cascade FKs)
2. AppSidebar + AppLayout components
3. Update App.tsx routing to use layout wrapper
4. Brand deletion (dashboard) + campaign deletion (campaigns list)
5. BrandSettings page (info, assets, instructions, QA checklist tabs)
6. GlobalSettings page (generation rules, QA checklist)
7. Update edge functions to consume new instructions and QA items
8. Agentic rule capture in edit-campaign (append detected rules to brand_instructions)

