# Zenx Creative — App Shell Design

Date: 2026-07-11
Status: Approved

## Context

Zenx Creative is a planned "operating system for content creators" (see PRD).
It has five major modules — Editor em massa, Calendário, Biblioteca de vídeos,
Performance dos perfis, Criador de Avatar (Influencer Builder) — each with
significant scope of its own (AI editing, Google integrations, analytics,
multi-step avatar generation).

This spec covers only the **app shell**: navigation, layout, design system,
and empty-module skeleton states. Each module above will get its own
brainstorm → spec → plan cycle later, built on top of this shell.

## Goals

- Establish the dark, premium visual identity described in the PRD (inspired
  by Linear, Raycast, Arc, Notion, Vercel, Framer, Stripe Dashboard).
- Provide working navigation between all five module routes with no reload.
- Ensure no route ever renders an empty screen — unbuilt modules show a
  skeleton that already matches their future layout.
- Set up the technical foundation (stack, design tokens, component base) that
  every subsequent module will build on.

## Non-goals

- Implementing any module's real functionality (Editor processing, Google
  Drive integration, analytics data, avatar generation, etc.).
- Authentication / real user accounts — the profile block in the sidebar is
  static mock data for now.
- Mobile/tablet-optimized layouts — desktop-first only; just avoid gross
  breakage on smaller viewports.

## Stack

- **Next.js (App Router) + TypeScript** — file-based routing across modules,
  and a foundation ready for the server-side work (OAuth, API routes) later
  modules will need.
- **Tailwind CSS** — utility-first styling matched to the PRD's exact design
  tokens.
- **lucide-react** — icon set (matches the icon style used in the reference
  mockups).
- **Inter** — typeface, standard for this category of product.

No component library (shadcn/ui) or animation library (Framer Motion) in
this phase: the only interactive primitive the shell needs is the sidebar
profile dropdown, which is small enough to hand-roll (plain React state +
outside-click/Escape handling) without pulling in Radix and a CLI-generated
theming layer whose exact output shifts across versions. Tailwind's built-in
`transition-colors` covers the shell's hover/active-state motion. Adopt
shadcn/ui and/or Framer Motion later, in whichever module first needs richer
primitives (forms, modals, drag-and-drop, step-wizard transitions) — likely
Criador de Avatar or Calendário.

## Design system

Defined as CSS variables in `app/globals.css` and wired into
`tailwind.config.ts`:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#000000` | Page background |
| `--card` | `#0B0B0B` | Card / surface background |
| `--card-hover` | `#141414` | Hover state, active sidebar item |
| `--border` | `#202020` | Card and input borders |
| `--primary` | `#3C00FF` | Accent — primary buttons, active states, focus rings |
| foreground | white / light gray | Body text, muted text via opacity |

Rules carried over from the PRD:
- No gradients; all visual emphasis comes from `--primary`.
- Border radius 12–16px on cards, buttons, inputs.
- Generous whitespace: ~32px page padding, 16–24px grid gaps (matches
  reference mockups).
- Glass/blur effects reserved for cases that clearly need them (e.g.
  dropdown overlays) — not a default surface treatment.

## Shell structure

```
app/
  (dashboard)/
    layout.tsx        # Sidebar + content shell, shared by all module routes
    editor/page.tsx
    calendario/page.tsx
    biblioteca/page.tsx
    performance/page.tsx
    criador-avatar/page.tsx
  globals.css
  layout.tsx           # Root layout (fonts, html/body)
  page.tsx              # Redirects "/" -> "/editor"
components/
  shell/
    sidebar.tsx
    sidebar-nav-item.tsx
    profile-menu.tsx
  skeletons/
    editor-skeleton.tsx
    calendario-skeleton.tsx
    biblioteca-skeleton.tsx
    performance-skeleton.tsx
    criador-avatar-skeleton.tsx
```

- `(dashboard)/layout.tsx` renders a fixed-width (~220px) sidebar on the left
  and a scrollable content area on the right. Only the content area scrolls;
  the sidebar stays put.
- Sidebar, top to bottom: "zenx creative" logo/wordmark → nav items (Editor,
  Calendário de postagem, Biblioteca de vídeos, Performance dos perfis,
  Criador de Avatar) → divider → profile block ("Zenx Creative · Plano Pro")
  with a dropdown (shadcn `DropdownMenu`).
- The active nav item is highlighted with `--card-hover` background and
  `--primary` icon/text color.
- Routes use Portuguese slugs matching the sidebar labels
  (`/editor`, `/calendario`, `/biblioteca`, `/performance`,
  `/criador-avatar`), consistent with the product's Portuguese UI.

## Module pages (skeleton state)

Since no module is implemented yet, every route beyond routing itself
renders a dedicated skeleton component (`<EditorSkeleton />`,
`<CalendarioSkeleton />`, etc.) that mirrors the real layout shown in the
reference mockups:

- **Editor**: stat cards row + grid of pulsing video-card placeholders +
  right-hand settings panel outline.
- **Calendário**: month grid with pulsing day cells, sidebar filter panel
  outline.
- **Biblioteca**: grid of pulsing video-card placeholders + storage panel
  outline.
- **Performance**: profile selector row + pulsing KPI cards + chart-shaped
  placeholders.
- **Criador de Avatar**: step indicator + pulsing form-field placeholders for
  the current step.

These are real components (not one generic "loading" placeholder) so that
building each module later means swapping the skeleton for real content
inside an already-correct layout, rather than reworking the page shell.

## Data flow

None yet — this phase is purely presentational. Sidebar state (active route)
comes from Next.js's router; profile data is a hardcoded mock object. No
network calls, no external services wired in this phase.

## Error handling

- Unknown routes under `(dashboard)` fall back to Next's default 404;
  no custom handling needed yet since there's no dynamic routing.
- No data-fetching yet, so no loading/error states beyond the skeletons
  themselves.

## Testing

- Vitest + React Testing Library for components that carry real logic:
  active-route highlighting in the sidebar, the profile menu's open/close/
  outside-click/Escape behavior, and that every module route renders its
  title and skeleton. Purely compositional or config files (root layout,
  Tailwind config, globals.css) aren't unit tested — they're covered by the
  build.
- `next build`, `tsc --noEmit`, and lint must pass (the correctness gate for
  this phase, alongside the component tests).
- Manual verification in-browser (per project convention for UI work):
  navigate to each of the 5 routes, confirm sidebar highlights the right
  item, confirm no route ever shows a blank screen, confirm layout doesn't
  break at common desktop widths (1280px, 1440px, 1920px).

## Open questions for later modules

- Auth/OAuth provider integration (Google) — deferred to whichever module
  needs it first (likely Biblioteca, given Google Drive storage).
- Whether module routes need nested layouts (e.g. wizard steps in Criador de
  Avatar) — will be decided in that module's own brainstorm.
