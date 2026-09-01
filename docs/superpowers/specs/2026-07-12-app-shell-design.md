# Zenx Creative — App Shell Design

Date: 2026-07-12
Status: Approved

## Context

Zenx Creative is a personal-use system ("uso próprio") for managing mass
short-form video editing, avatar creation, post scheduling, and
multi-profile performance analytics. It has five major modules — Editor em
massa, Calendário de postagem, Biblioteca de vídeos, Performance dos
perfis, Criador de Avatar — each with significant scope of its own.

This spec covers only the **app shell**: navigation, layout, design system,
and empty-module skeleton states. Each module gets its own brainstorm →
spec → plan cycle, built on top of this shell. (Editor em massa's spec
follows immediately after this one.)

Note: an earlier attempt at this same shell exists on an orphaned git
branch (`app-shell`, from a pruned worktree) with a different visual
direction (pure black background, purple `#3C00FF` accent, no textured
background). That work was explicitly not reused — this is a fresh design
with its own visual identity.

## Goals

- Establish a dark, premium visual identity: neutral dark background with a
  subtle textured backdrop and a single accent color, no gradients or
  heavy decoration.
- Provide working navigation between all five module routes with no reload.
- Ensure no route ever renders an empty screen — unbuilt modules show a
  skeleton that already matches their future layout.
- Set up the technical foundation (stack, design tokens, component base)
  that every subsequent module builds on.

## Non-goals

- Implementing any module's real functionality.
- Authentication / real user accounts — the profile block in the sidebar is
  static mock data for now.
- Mobile/tablet-optimized layouts — desktop-first only; just avoid gross
  breakage on smaller viewports.

## Stack

- **Next.js (App Router) + TypeScript** — file-based routing across
  modules, and a foundation ready for later server-side work (imports,
  storage, integrations) that individual modules will need.
- **Tailwind CSS** — utility-first styling matched to the design tokens
  below.
- **lucide-react** — icon set.
- **Inter** — typeface.

No component library or animation library in this phase — the shell's only
interactive primitive is the sidebar navigation (active-route highlighting)
and a profile block, both simple enough to hand-roll. Adopt richer
primitives (shadcn/ui, Framer Motion, etc.) later in whichever module first
needs them (forms, modals, step-wizards).

## Design system

Defined as CSS variables in `app/globals.css` and wired into
`tailwind.config.ts`:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0A0A0A` | Page background |
| `--card` | `rgba(255,255,255,0.04)` | Card / surface background |
| `--card-hover` | `rgba(255,255,255,0.08)` | Hover state, active sidebar item background |
| `--border` | `rgba(255,255,255,0.10)` | Card and input borders |
| `--accent` | `#6C7BFF` | Buttons, links, active nav item, focus rings |
| foreground | white / `rgba(255,255,255,0.5–0.7)` | Body text / muted text |

Rules:
- No gradients; the only decorative element is the background grid.
- Border radius 10–16px on cards, buttons, inputs.
- Generous whitespace: ~32px page padding, 12–24px grid gaps.

## Background

A dedicated `<GridBackground />` component, fixed behind all content:

- Fine 1px line grid (`rgba(255,255,255,0.09)`), 26px spacing, over the
  `--bg` base color.
- A radial `mask-image` (`radial-gradient(ellipse 70% 60% at 50% 20%, #000
  40%, transparent 100%)`) fades the grid out toward the edges of the
  screen, concentrating it near the top-center.
- Pure CSS — no canvas, no WebGL, no JS animation loop, no per-frame cost.
- `position: fixed; inset: 0; z-index: -1; pointer-events: none`, rendered
  once in the root layout.

(This replaces an earlier animated WebGL "Plasma" shader background that
was prototyped and explicitly rejected in favor of this simpler, static
approach.)

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
  layout.tsx           # Root layout (fonts, <GridBackground />)
  page.tsx              # Redirects "/" -> "/editor"
components/
  shell/
    sidebar.tsx
    sidebar-nav-item.tsx
    profile-menu.tsx
  background/
    grid-background.tsx
  skeletons/
    editor-skeleton.tsx
    calendario-skeleton.tsx
    biblioteca-skeleton.tsx
    performance-skeleton.tsx
    criador-avatar-skeleton.tsx
```

- `(dashboard)/layout.tsx` renders a fixed-width (~220px) sidebar on the
  left and a scrollable content area on the right. Only the content area
  scrolls; the sidebar stays put.
- Sidebar, top to bottom: "zenx creative" wordmark → nav items (Editor em
  massa, Calendário, Biblioteca, Performance, Criador de Avatar) → profile
  block ("Zenx Creative · Uso pessoal").
- The active nav item is highlighted with `--card-hover` background and
  `--accent` text/icon color.
- Routes use Portuguese slugs matching the sidebar labels (`/editor`,
  `/calendario`, `/biblioteca`, `/performance`, `/criador-avatar`).

## Module pages (skeleton state)

Every route beyond Editor em massa (which gets real functionality in the
next spec) renders a dedicated skeleton component that mirrors its real
future layout:

- **Calendário**: month grid of pulsing day cells, "+ Agendar post" action.
- **Biblioteca**: grid of pulsing video-card placeholders, "+ Enviar vídeo"
  action.
- **Performance**: KPI stat-card row + chart-shaped placeholder, "Exportar
  relatório" action.
- **Criador de Avatar**: step indicator + pulsing form-field placeholders
  for the current step.

These are real components (not one generic "loading" placeholder) so that
building each module later means swapping the skeleton for real content
inside an already-correct layout.

## Data flow

None yet — this phase is purely presentational. Sidebar active-state comes
from Next.js's router; profile data is a hardcoded mock object. No network
calls, no external services wired in this phase.

## Error handling

- Unknown routes under `(dashboard)` fall back to Next's default 404.
- No data-fetching yet, so no loading/error states beyond the skeletons
  themselves.

## Testing

- Vitest + React Testing Library for components with real logic:
  active-route highlighting in the sidebar, and that every module route
  renders its title and skeleton.
- `next build`, `tsc --noEmit`, and lint must pass.
- Manual verification in-browser: navigate to each of the 5 routes, confirm
  sidebar highlights the right item, confirm no route ever shows a blank
  screen, confirm layout doesn't break at common desktop widths (1280px,
  1440px, 1920px).

## Open questions for later modules

- Auth/OAuth provider integration — deferred to whichever module needs it
  first.
- Whether module routes need nested layouts (e.g. wizard steps in Criador
  de Avatar) — decided in that module's own brainstorm.
