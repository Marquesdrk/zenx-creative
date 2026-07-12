# Zenx Creative — Editor em Massa Design

Date: 2026-07-12
Status: Approved

## Context

Editor em massa is the first real module built on top of the [app shell](2026-07-12-app-shell-design.md).
Its purpose: import short-form videos in bulk and automatically prepare
them for posting — remove the original watermark, apply the user's own
saved watermark, generate captions, and composite the result into one of
three visual templates. A pencil button on each processed video allows
manual touch-ups.

This spec covers the **interface only**. The automatic processing itself
(watermark removal via AI, caption generation, video compositing, real
Google Drive OAuth) is complex, backend-heavy work that gets its own
spec later. Here, processing is simulated with timed state transitions so
the full screen flow — import, batch configuration, per-video status,
manual edit — can be built and validated now.

## Goals

- Let the user configure and kick off an import batch: pick a source
  (upload or Google Drive), a profile, and a template.
- Show each video's progress through import → processing → ready, with a
  grid that never leaves the user guessing about state.
- Provide a manual-edit drawer for the three touch-ups that matter most:
  watermark position/size, caption text, and crop/framing.
- Establish the three output templates (React, Twitter Style,
  Shop/Content) as real, selectable options with a live preview.

## Non-goals

- Real video processing: no actual watermark removal/injection, caption
  generation, or template compositing. All simulated with mock data and
  timers.
- Real Google Drive OAuth/integration — the "Conectar Google Drive" entry
  point exists in the UI but does not perform a real connection.
- Watermark and avatar library management — profiles (with their avatar,
  watermark, and handle) are mocked here; managing them is Criador de
  Avatar's job.
- Persistence beyond the browser session (no database yet).
- Publishing/scheduling the finished videos — that's Calendário's job.

## Screen flow

1. **`/editor` (grid view)** — matches the shell's skeleton layout, now
   with real per-batch, per-video state. Header has the existing stat row
   (vídeos hoje, perfis ativos, agendados) and a **"+ Novo lote"** button.
2. **Batch modal** (opens on "+ Novo lote"):
   - **Fonte**: tab/toggle between "Enviar arquivos" (drag-drop zone,
     multi-file) and "Google Drive" (a "Conectar" button; clicking it
     shows a mocked "connected" state with a fake folder name — no real
     OAuth flow).
   - **Perfil**: dropdown of 2–3 mocked profiles, each showing avatar,
     handle, and a small watermark preview.
   - **Template**: the three template cards (React, Twitter Style,
     Shop/Content) from the approved visual design, selectable like radio
     cards.
   - "Importar" is disabled until fonte + perfil + template are all set.
   - On submit: modal closes, the chosen videos appear in the grid
     belonging to a new `Batch`, each starting in `importing` status.
3. **Grid view updates live**: each `VideoCard` transitions
   `importing → processing → ready` via mocked timers (a few seconds each,
   staggered per video so the grid doesn't jump all at once). A `ready`
   card shows its thumbnail, a "Pronto" badge, and a pencil button
   beneath it.
4. **Edit drawer** (opens on pencil click): slides in from the right.
   Shows:
   - A frame preview with the applied watermark as a draggable, resizable
     overlay (`WatermarkCanvas`).
   - The generated caption in an editable textarea.
   - A crop/framing control (a draggable crop box over the frame preview)
     — most relevant for the React template, where auto-crop can miss.
   - "Salvar" applies the edits to that video's mock data and closes the
     drawer; no server round-trip (in-memory update only).

## Data model (mock, in-memory)

```ts
type Profile = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  watermarkUrl: string;
};

type Template = 'react' | 'twitter-style' | 'shop-content';

type VideoStatus = 'importing' | 'processing' | 'ready' | 'error';

type Batch = {
  id: string;
  profileId: string;
  template: Template;
  createdAt: string;
};

type Video = {
  id: string;
  batchId: string;
  filename: string;
  status: VideoStatus;
  thumbnailUrl: string;
  caption: string;
  watermarkPosition: { x: number; y: number; scale: number };
  cropBox: { x: number; y: number; width: number; height: number };
};
```

`error` is part of the type for when real processing lands later, but the
mock pipeline always resolves to `ready` — no simulated failures.

## Components

```
app/(dashboard)/editor/page.tsx
components/editor/
  batch-modal.tsx        # source + profile + template selection
  template-picker.tsx     # the 3 template cards, with live preview
  profile-picker.tsx      # dropdown of mocked profiles
  video-grid.tsx
  video-card.tsx           # thumbnail, status badge, pencil button
  edit-drawer.tsx          # side panel host for manual edits
  watermark-canvas.tsx     # drag/resize watermark + crop box overlay
lib/editor/
  types.ts
  mock-profiles.ts
  mock-processing.ts       # drives importing -> processing -> ready timers
```

State (batches, videos, selected profile) lives in a single React context
or a small Zustand-less `useState`/`useReducer` at the `/editor` page level
— no global state library needed for this scope.

## Error handling

- Batch modal: "Importar" stays disabled with inline hints until all three
  fields are chosen; no other validation needed (mock data only).
- `error` status is defined and gets a visual treatment (red badge, retry
  affordance) so the UI is ready for real processing, even though the mock
  pipeline never produces it.

## Testing

- `batch-modal`: submit disabled until fonte+perfil+template set; selecting
  each enables it; submit creates a batch and closes the modal.
- `video-card`: renders correct visual per status (`importing`,
  `processing`, `ready`, `error`).
- `mock-processing`: using fake timers, confirms a video moves through all
  three states in order.
- `edit-drawer`: opens with the correct video's data, "Salvar" persists
  changes to that video's mock record, closes on save/cancel/Escape.
- `next build`, `tsc --noEmit`, lint must pass.
- Manual verification: create a batch via upload, watch it resolve to
  ready, open the drawer, drag the watermark, edit the caption, save, and
  confirm the change sticks in the grid.

## Open questions for later

- Real processing spec: how watermark removal/injection and caption
  generation actually work (AI approach, cost, latency).
- Real Google Drive OAuth and folder-watch mechanics.
- Whether template can be changed per-video after the batch is created
  (explicitly excluded from manual edit in this version).
