

# Restructure Brand Subpages

## Current State
The sidebar has 4 sub-items per brand: Campaigns, Brand Settings, Intelligence, Brand Guide. Most content lives in the monolithic `BrandSettings.tsx` page with 7 tabs (Info, Intelligence, Assets, Products, Preferences, Integrations, Analysis).

## New Structure
Each brand gets 7 sidebar sub-items, each mapping to a dedicated route/page:

| Sidebar Item | Route | Content |
|---|---|---|
| Campaigns | `/brands/:id` | Existing `CampaignsList` (no change) |
| Calendar | `/brands/:id/calendar` | New "Coming Soon" placeholder |
| Segments | `/brands/:id/segments` | New "Coming Soon" placeholder |
| Brand | `/brands/:id/brand` | Assets + Products + ShopifyProductGrid + Analysis (ReanalyzeBrand) + Brand Guide |
| Intelligence | `/brands/:id/intelligence` | Existing `BrandIntelligenceWizard` (already exists, keep as-is) |
| Integrations | `/brands/:id/integrations` | Klaviyo, Shopify, ClickUp setup components (moved from BrandSettings) |
| Preferences | `/brands/:id/preferences` | Brand Info (name/industry/url) + Instructions + QA Checklist + Delete Brand |

## Changes

### 1. Update sidebar sub-items (`AppSidebar.tsx`)
Replace `getBrandSubItems` to return 7 items with matching icons and paths. Add a `preferences` icon to `SidebarIcons.tsx` (sliders/toggle style).

### 2. Create new page files

**`src/pages/BrandCalendar.tsx`** — Simple "Coming Soon" placeholder page.

**`src/pages/BrandSegments.tsx`** — Simple "Coming Soon" placeholder page.

**`src/pages/BrandIntegrations.tsx`** — New page pulling Klaviyo/Shopify/ClickUp setup out of BrandSettings.

**`src/pages/BrandPreferences.tsx`** — New page with brand info fields (name, industry, URL), instructions textarea, QA checklist, and delete brand danger zone.

**`src/pages/BrandProfile.tsx`** — New "Brand" page combining AssetManager, ProductManager, ShopifyProductGrid, ReanalyzeBrand, and Brand Guide content.

### 3. Refactor `BrandSettings.tsx` → remove it
All its content is redistributed. Remove the file and its route.

### 4. Update `BrandIntelligence.tsx`
Keep as-is — it already has the wizard. Just ensure the `onComplete` callback navigates correctly.

### 5. Update routes (`App.tsx`)
Remove `/brands/:id/settings` and `/brands/:id/guide`. Add:
- `/brands/:id/calendar` → `BrandCalendar`
- `/brands/:id/segments` → `BrandSegments`
- `/brands/:id/brand` → `BrandProfile`
- `/brands/:id/integrations` → `BrandIntegrations`
- `/brands/:id/preferences` → `BrandPreferences`

### 6. Add `preferences` icon to `SidebarIcons.tsx`
A sliders/toggle icon to match the design system.

### 7. Active path matching in sidebar
The sidebar currently does exact `activePath === item.path` matching. This stays correct since each page has a unique route.

## Files Summary

| File | Action |
|---|---|
| `src/components/AppSidebar.tsx` | Update `getBrandSubItems` to 7 items |
| `src/components/sidebar/SidebarIcons.tsx` | Add `preferences` icon |
| `src/pages/BrandCalendar.tsx` | Create — coming soon |
| `src/pages/BrandSegments.tsx` | Create — coming soon |
| `src/pages/BrandProfile.tsx` | Create — combines assets, products, analysis, guide |
| `src/pages/BrandIntegrations.tsx` | Create — Klaviyo/Shopify/ClickUp |
| `src/pages/BrandPreferences.tsx` | Create — info, instructions, QA, delete |
| `src/pages/BrandSettings.tsx` | Delete |
| `src/App.tsx` | Update routes |

