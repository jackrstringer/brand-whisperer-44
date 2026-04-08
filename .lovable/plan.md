
# CampaignStudio Design System Overhaul

## Scope
Replace the current pink-themed design with a premium monochrome system (8-color palette, Instrument Serif + DM Sans fonts, no shadows, no colored accents).

## Phase 1: Foundation (CSS tokens, fonts, global reset)
- Add Google Fonts import (Instrument Serif + DM Sans) to `index.html`
- Rewrite `src/index.css` — replace all HSL color tokens with the 8-color hex palette, add shimmer animation, global reset, font-smoothing
- Update `tailwind.config.ts` — map all design tokens to the new palette, update border-radius defaults, remove shadow utilities
- Remove pink/colored accent references everywhere

**Files**: `index.html`, `src/index.css`, `tailwind.config.ts`

## Phase 2: Core UI components (shadcn overrides)
- `button.tsx` — primary = `#2B2B2B` fill, outline = `#E8E8E8` border, pill radius 15px, no shadows
- `card.tsx` — `#FFFFFF` bg, `#E8E8E8` border, 12px radius, 28px padding, no shadow
- `badge.tsx` — status pill style (15px radius, `#F2F2F2` bg or outline)
- `input.tsx` — `#E8E8E8` border, 8px radius
- `table.tsx` — 12px container radius, `#F2F2F2` row dividers, uppercase headers
- `tabs.tsx`, `dialog.tsx`, `select.tsx`, `dropdown-menu.tsx` — align to monochrome palette
- `skeleton.tsx` — shimmer gradient pattern
- `progress.tsx` — gradient fill `#2B2B2B → #686868`

**Files**: ~12 shadcn component files

## Phase 3: Sidebar redesign
- Rewrite `AppSidebar.tsx` — 240px expanded / 56px collapsed, white bg, new nav pill style
- Add dock-effect dot magnification in collapsed state
- Add peek-on-hover behavior (264px peek width, staggered label fade)
- Add click-to-collapse/expand on dead space
- Custom inline SVG icons (replace Lucide)
- Bottom section with moon toggle + settings gear (with rotate animation)

**Files**: `src/components/AppSidebar.tsx`, `src/components/ui/sidebar.tsx`

## Phase 4: Page layouts & remaining components
- Update `AppLayout.tsx` — `#FAFAFA` bg, proper padding/max-width
- Update all page headers to use Instrument Serif 32px titles
- Update `KlaviyoSetup.tsx`, `BrandIntelligenceTab.tsx`, and other feature components to use new tokens
- Remove all `text-emerald-*`, `text-yellow-*`, `bg-emerald-*` etc. hardcoded color classes
- Replace Lucide icon usage in sidebar (keep Lucide in content areas for now)

**Files**: All page files, feature components

## Implementation Order
Start with Phase 1 (foundation) since everything else depends on it. Each phase builds on the previous.

## Anti-patterns to enforce
- Zero `box-shadow` anywhere
- No `rgba()`/`hsla()`
- No colors outside the 8-token palette
- Border-radius only: 3px, 8px, 10px, 12px, 15px, 50%
- No `transition: all` — specify exact properties
