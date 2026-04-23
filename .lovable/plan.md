

## Goal

Rebuild the flow builder visuals to match the rest of the app (light, monochrome, Geist/Inter, no emojis, real hover/active states) while keeping the Teenage-Engineering-meets-Apple-meets-Miro feel. Functionality stays; only the visual layer and interaction polish change.

## What's wrong now

- Hardcoded `--flow-canvas`, `--flow-card`, `--flow-border` tokens force dark mode, ignoring the app's existing light monochrome system.
- Emoji icons (✉, ⏱, ◆, ⚡, 🔔, ⚙️, 📝, 📋, 🔗, 💬, 🔔) in `NODE_KIND_META` and node headers — the rest of the app uses Lucide icons exclusively.
- Cards have no real hover/active feedback, no shadow elevation, no scale, no border transitions.
- Palette tiles are flat black squares with no affordance.
- Top bar, sidebar, strategy panel, chat panel all use ad-hoc dark colors instead of `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`.
- Edges, minimap, controls all themed to a dark canvas that doesn't exist anywhere else in the product.

## Visual system (matches existing app)

- **Canvas**: `bg-background` (light), dot grid using `border` token at low opacity. Same surface as Ideate page.
- **Cards**: `bg-card`, `border-border`, `rounded-xl`, subtle `shadow-sm` at rest → `shadow-md` + `border-foreground/20` on hover → `border-foreground` + `shadow-lg` + `scale-[1.01]` on select. 200ms spring on all.
- **Type**: Geist/Inter (already loaded). Node titles `text-[13px] font-semibold tracking-tight`. Metadata `text-[11px] text-muted-foreground`. Monospace only for delay durations and metric numbers (`font-mono tabular-nums`).
- **Icons**: Lucide only — `Mail`, `MessageSquare`, `Bell`, `Clock`, `GitBranch`, `Zap`, `UserPen`, `ListPlus`, `Webhook`, `BellRing`, `Settings2`. 14px, `text-foreground/70`, in a `w-7 h-7 rounded-lg bg-muted` tile inside the card header.
- **Status pills**: replace colored dots. `Live` = `bg-foreground text-background`, `Manual` = `bg-muted text-foreground`, `Draft` = `border border-border text-muted-foreground`. All `text-[10px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full`.
- **Edges**: `border` token color at rest, `foreground` on hover, `foreground` + `stroke-width 2.5` when selected. "+" insertion button becomes a clean `bg-foreground text-background` circle with Lucide `Plus`, scales 1 → 1.08 on hover.
- **YES/NO labels**: monospace `text-[10px]`, `bg-card border border-border`, no green/red tinting (kept monochrome — branch identity comes from position + label, not color).
- **Minimap + Controls**: `bg-card border-border`, rounded, same elevation as everywhere else. No frosted glass.

## Interaction polish

- Every clickable element: 150ms transition on `bg`, `border`, `shadow`, `transform`.
- Node hover: card lifts (shadow + 1px border darken), drag handle dots fade in on the right.
- Node select: border thickens to `foreground`, slight scale, soft outer shadow ring.
- Palette tiles: hover fills `bg-muted`, active scales 0.98, drag start lifts with shadow.
- Edge "+" only appears on edge hover, fades in 120ms.
- QuickAddMenu: scales from click point (0.95 → 1, 150ms), `bg-popover border-border shadow-lg`, items use `hover:bg-muted` like every other menu in the app.
- Chat panel collapsed strip: 48px, vertical "AI" label, hover widens border. Expanded: matches `ChatBar` styling from ideation.
- Top bar: same height/padding as `AppLayout` headers, status as a `Select` from shadcn instead of native, undo/redo as ghost icon buttons.
- Strategy panel: collapsible like the ideation `SplitPane`, monospace TOC with hover row highlight, click → `setCenter` with 400ms ease.

## Files to change

- `src/index.css` — remove the dark `--flow-*` tokens; either delete or remap them to existing semantic tokens (`--background`, `--card`, `--border`, `--foreground`, `--muted`, `--muted-foreground`, `--popover`).
- `src/components/flowbuilder/types.ts` — drop emoji from `NODE_KIND_META`, replace with Lucide icon component refs.
- `src/components/flowbuilder/nodes/BaseNodeCard.tsx` — restyle header, status pill, hover/select states, drag handle.
- `src/components/flowbuilder/nodes/{Trigger,TimeDelay,Email,Sms,ConditionalSplit,Simple}Node.tsx` — swap emoji for Lucide, update typography, monochrome status, real hover.
- `src/components/flowbuilder/edges/InsertableEdge.tsx` — monochrome stroke, Lucide `Plus`, monochrome YES/NO labels.
- `src/components/flowbuilder/Canvas.tsx` — light dot grid, restyle `Background`/`Controls`/`MiniMap` to use semantic tokens.
- `src/components/flowbuilder/QuickAddMenu.tsx` — match shadcn popover/menu styling, Lucide icons, search input matches app inputs.
- `src/components/flowbuilder/LeftSidebar.tsx` — light sidebar matching `AppSidebar` aesthetic, palette tiles with proper affordance, config panel uses standard `Label`/`Input`/`Select`/`Textarea` from shadcn.
- `src/components/flowbuilder/TopBar.tsx` — match app header height and tokens, shadcn `Select` for status, ghost icon buttons for undo/redo, inline-editable name like Ideate.
- `src/components/flowbuilder/StrategyPanel.tsx` — collapsible card, monospace TOC, hover rows, no emoji.
- `src/components/flowbuilder/MessageFlyout.tsx` — restyle as a sheet/peek panel matching `TaskDetail` (the existing ClickUp-inspired peek panel), reuse its visual language.
- `src/components/flowbuilder/ChatPanel.tsx` — collapsed vertical strip + expanded panel that visually matches `ChatBar` from ideation.

## Behavior unchanged

- All data, autosave, undo/redo, edge insertion, drag-from-palette, double-click-to-add, flyout open, chat routing — none of it changes. Pure visual + interaction-feedback rebuild.

## Out of scope

- Adding new features from the original spec (analytics overlay, A/B wrapper, keyboard shortcuts beyond what exists).
- Touching backend or edge functions.

