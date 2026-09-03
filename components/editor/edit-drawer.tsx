"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { clamp, contentTargetAspect } from "@/lib/editor/crop-geometry";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { CropBoxEditor } from "./crop-box-editor";
import { VideoFrame } from "./video-frame";
import { WatermarkCanvas } from "./watermark-canvas";
import {
  ASPECT_MODE_LABELS,
  FULL_FRAME_CROP,
  resolveXStyleLayout,
  type AspectMode,
  type BatchItem,
  type Crop,
  type Profile,
  type Rotation,
  type XStyleVideoFrame,
} from "@/lib/editor/types";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const MIN_X_STYLE_FRAME_SIZE = 80;
const ASPECT_MODES: AspectMode[] = ["free", "original", "9:16", "1:1", "4:5", "template"];
const CROP_FIELDS: { key: keyof Crop; label: string }[] = [
  { key: "x", label: "X" },
  { key: "y", label: "Y" },
  { key: "width", label: "Largura" },
  { key: "height", label: "Altura" },
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</p>;
}

export function EditDrawer({
  item,
  profile,
  onClose,
  onSave,
  positionLabel,
  onPrev,
  onNext,
}: {
  item: BatchItem;
  profile: Profile;
  onClose: () => void;
  onSave: (item: BatchItem, applyToAll: boolean) => void;
  /** Ex.: "3 de 8" — quantos vídeos tem o lote e qual está aberto agora. */
  positionLabel?: string;
  /** Ausente (undefined) quando não há vizinho nessa direção — some o botão. */
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [applyToAll, setApplyToAll] = useState(false);
  const [duration, setDuration] = useState(0);
  const [redetecting, setRedetecting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const trimVideoRef = useRef<HTMLVideoElement>(null);
  const overrides = draft.manualOverrides;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const video = trimVideoRef.current;
    if (!video) return;
    video.volume = overrides.volume;
    video.muted = overrides.muted;
  }, [overrides.volume, overrides.muted]);

  function updateOverrides(patch: Partial<BatchItem["manualOverrides"]>) {
    setDraft((current) => ({
      ...current,
      manualOverrides: { ...current.manualOverrides, ...patch },
    }));
  }

  function updateCropField(key: keyof Crop, percent: number) {
    const value = clamp(percent / 100, 0, 1);
    const next = { ...overrides.crop, [key]: value };
    if (key === "x") next.width = Math.min(next.width, 1 - value);
    if (key === "y") next.height = Math.min(next.height, 1 - value);
    if (key === "width") next.width = Math.min(value, 1 - next.x);
    if (key === "height") next.height = Math.min(value, 1 - next.y);
    updateOverrides({ crop: next });
  }

  const defaultXStyleVideoFrame =
    profile.engine === "X_STYLE" ? resolveXStyleLayout(profile.xStyleLayout).video : null;
  const xStyleVideoFrame = overrides.xStyleVideoFrame ?? defaultXStyleVideoFrame;

  function updateXStyleVideoFrame(patch: Partial<XStyleVideoFrame>) {
    if (!xStyleVideoFrame) return;
    const next = {
      ...xStyleVideoFrame,
      ...patch,
    };
    next.width = Math.round(Math.min(OUTPUT_WIDTH, Math.max(MIN_X_STYLE_FRAME_SIZE, next.width)));
    next.height = Math.round(Math.min(OUTPUT_HEIGHT, Math.max(MIN_X_STYLE_FRAME_SIZE, next.height)));
    next.x = Math.round(Math.min(OUTPUT_WIDTH - next.width, Math.max(0, next.x)));
    next.y = Math.round(Math.min(OUTPUT_HEIGHT - next.height, Math.max(0, next.y)));
    updateOverrides({ xStyleVideoFrame: next });
  }

  async function handleRedetect() {
    if (!draft.contentUrl) return;
    setRedetecting(true);
    const analysis = await analyzeVideoSource(draft.contentUrl);
    setDraft((current) => ({
      ...current,
      sourceAnalysis: analysis,
      manualOverrides: {
        ...current.manualOverrides,
        crop: analysis.suggestedCrop,
      },
    }));
    setRedetecting(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[92vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-2xl border border-border bg-[#101010]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Editar vídeo</h2>
            <p className="truncate text-xs text-muted">{draft.filename}</p>
          </div>
          <div className="flex items-center gap-3">
            {(onPrev || onNext || positionLabel) && (
              <div className="flex items-center gap-1.5 rounded-lg border border-border bg-[#141414] p-1">
                <button
                  type="button"
                  aria-label="Vídeo anterior do lote"
                  onClick={onPrev}
                  disabled={!onPrev}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 hover:bg-card-hover hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                {positionLabel && <span className="px-1 text-xs font-semibold text-muted">{positionLabel}</span>}
                <button
                  type="button"
                  aria-label="Próximo vídeo do lote"
                  onClick={onNext}
                  disabled={!onNext}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 hover:bg-card-hover hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-card-hover hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Prévias fixas para comparar a arte do template com o resultado final. */}
          <div
            className={`flex shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-black/30 p-6 ${
              profile.engine === "X_STYLE" ? "w-[620px]" : "w-[340px]"
            }`}
          >
            {profile.engine === "X_STYLE" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Template</p>
                  <VideoFrame
                    profile={profile}
                    title={overrides.title}
                    caption={overrides.caption}
                    contentUrl={null}
                    xStyleVideoFrame={overrides.xStyleVideoFrame}
                  />
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Completo</p>
                  <VideoFrame
                    profile={profile}
                    title={overrides.title}
                    caption={overrides.caption}
                    contentUrl={draft.contentUrl}
                    contentCrop={overrides.crop}
                    contentZoom={overrides.zoom}
                    contentFit={overrides.fit}
                    contentRotation={overrides.rotation}
                    playing
                    xStyleVideoFrame={overrides.xStyleVideoFrame}
                  />
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-[280px]">
                {profile.engine === "UGC" ? (
                  <WatermarkCanvas
                    profile={profile}
                    caption={overrides.caption}
                    contentUrl={draft.contentUrl}
                    contentCrop={overrides.crop}
                    contentZoom={overrides.zoom}
                    contentFit={overrides.fit}
                    contentRotation={overrides.rotation}
                    watermarkPosition={overrides.watermarkPosition}
                    onWatermarkPositionChange={(watermarkPosition) => updateOverrides({ watermarkPosition })}
                  />
                ) : (
                  <VideoFrame
                    profile={profile}
                    title={overrides.title}
                    caption={overrides.caption}
                    contentUrl={draft.contentUrl}
                    contentCrop={overrides.crop}
                    contentZoom={overrides.zoom}
                    contentFit={overrides.fit}
                    contentRotation={overrides.rotation}
                    playing
                    xStyleVideoFrame={overrides.xStyleVideoFrame}
                    reactionMediaUrl={
                      profile.engine === "REACT"
                        ? (profile.reactionMedia.find((r) => r.id === overrides.reactionMediaId)?.url ??
                          null)
                        : null
                    }
                  />
                )}
              </div>
            )}

            {draft.sourceAnalysis && (
              <div className="mx-auto flex w-full max-w-[280px] items-center justify-between gap-2">
                <p className="text-[11px] text-muted">
                  {draft.sourceAnalysis.width}×{draft.sourceAnalysis.height}px
                  {draft.sourceAnalysis.hasLetterboxing ? " · barras detectadas, recorte sugerido" : ""}
                </p>
                {draft.contentUrl && (
                  <button
                    type="button"
                    onClick={handleRedetect}
                    disabled={redetecting}
                    className="shrink-0 text-[11px] font-semibold text-accent disabled:opacity-40"
                  >
                    {redetecting ? "Analisando…" : "Redetectar"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Ferramentas — coluna própria, com mais espaço para respirar. */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col gap-6">
              {profile.engine === "UGC" && (
                <div>
                  <SectionLabel>Marca d&apos;água</SectionLabel>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="watermark-scale" className="mb-1 block text-xs text-muted">
                        Tamanho
                      </label>
                      <input
                        id="watermark-scale"
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.1}
                        value={overrides.watermarkPosition.scale}
                        onChange={(event) =>
                          updateOverrides({
                            watermarkPosition: {
                              ...overrides.watermarkPosition,
                              scale: Number(event.target.value),
                            },
                          })
                        }
                        className="w-full accent-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="watermark-opacity" className="mb-1 block text-xs text-muted">
                        Opacidade
                      </label>
                      <input
                        id="watermark-opacity"
                        type="range"
                        min={0.2}
                        max={1}
                        step={0.05}
                        value={overrides.watermarkPosition.opacity}
                        onChange={(event) =>
                          updateOverrides({
                            watermarkPosition: {
                              ...overrides.watermarkPosition,
                              opacity: Number(event.target.value),
                            },
                          })
                        }
                        className="w-full accent-accent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {profile.engine === "REACT" && profile.reactionMedia.length > 0 && (
                <div>
                  <SectionLabel>Mídia de reação</SectionLabel>
                  <div className="grid grid-cols-4 gap-2">
                    {profile.reactionMedia.map((media) => (
                      <button
                        key={media.id}
                        type="button"
                        aria-pressed={overrides.reactionMediaId === media.id}
                        onClick={() => updateOverrides({ reactionMediaId: media.id })}
                        className={`flex flex-col gap-1 rounded-lg border p-1 text-left ${
                          overrides.reactionMediaId === media.id
                            ? "border-accent bg-card-hover"
                            : "border-border bg-card hover:bg-card-hover"
                        }`}
                      >
                        <div className="aspect-square overflow-hidden rounded-md bg-black">
                          {media.url && (
                            <video
                              src={media.url}
                              muted
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(event) => {
                                const video = event.currentTarget;
                                if (Number.isFinite(video.duration)) {
                                  video.currentTime = Math.min(0.1, video.duration / 2);
                                }
                              }}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <span className="truncate text-[10px] text-gray-300">{media.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {profile.engine === "X_STYLE" && (
                <div>
                  <SectionLabel>Título</SectionLabel>
                  <input
                    id="title"
                    aria-label="Título"
                    value={overrides.title ?? profile.defaultTitle ?? ""}
                    onChange={(event) => updateOverrides({ title: event.target.value })}
                    className="w-full rounded-lg border border-border bg-card p-2 text-sm text-foreground"
                  />
                </div>
              )}

              {profile.engine === "X_STYLE" && xStyleVideoFrame && defaultXStyleVideoFrame && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <SectionLabel>Dimensão do vídeo no template</SectionLabel>
                    <button
                      type="button"
                      onClick={() => updateOverrides({ xStyleVideoFrame: null })}
                      className="text-[11px] font-semibold text-accent"
                    >
                      Usar automático
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["x", "X", 0, 1080 - xStyleVideoFrame.width],
                      ["y", "Y", 0, 1920 - xStyleVideoFrame.height],
                      ["width", "Largura", MIN_X_STYLE_FRAME_SIZE, OUTPUT_WIDTH],
                      ["height", "Altura", MIN_X_STYLE_FRAME_SIZE, OUTPUT_HEIGHT],
                    ] as const).map(([key, label, min, max]) => (
                      <label key={key} className="rounded-lg border border-border bg-card p-3">
                        <span className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-muted">
                          {label}
                          <span className="flex items-center gap-1">
                            <input
                              type="number"
                              min={min}
                              max={Math.max(min, max)}
                              step={4}
                              value={xStyleVideoFrame[key]}
                              onChange={(event) => updateXStyleVideoFrame({ [key]: Number(event.target.value) })}
                              className="h-7 w-20 rounded-md border border-border bg-[#111] px-2 text-right text-xs tabular-nums text-gray-200 outline-none focus:border-accent"
                            />
                            <span className="text-gray-400">px</span>
                          </span>
                        </span>
                        <input
                          type="range"
                          min={min}
                          max={Math.max(min, max)}
                          step={4}
                          value={xStyleVideoFrame[key]}
                          onChange={(event) => updateXStyleVideoFrame({ [key]: Number(event.target.value) })}
                          className="w-full accent-accent"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {profile.engine !== "REACT" && (
                <div>
                  <SectionLabel>{profile.engine === "X_STYLE" ? "Texto abaixo do vídeo" : "Legenda"}</SectionLabel>
                  <textarea
                    id="caption"
                    aria-label={profile.engine === "X_STYLE" ? "Texto abaixo do vídeo" : "Legenda"}
                    value={overrides.caption}
                    placeholder={profile.engine === "X_STYLE" ? "Ex.: Link na bio" : undefined}
                    onChange={(event) => updateOverrides({ caption: event.target.value })}
                    rows={profile.engine === "X_STYLE" ? 2 : 3}
                    className="w-full rounded-lg border border-border bg-card p-2 text-sm text-foreground"
                  />
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <SectionLabel>Recorte do conteúdo</SectionLabel>
                  <span className="text-[11px] tabular-nums text-gray-400">{overrides.zoom.toFixed(1)}×</span>
                </div>
                <p className="mb-2 -mt-1 text-[11px] text-muted">
                  Arraste para reposicionar. Use as bordas para ajustar.
                </p>
                <CropBoxEditor
                  contentUrl={draft.contentUrl}
                  sourceWidth={draft.sourceAnalysis?.width || OUTPUT_WIDTH}
                  sourceHeight={draft.sourceAnalysis?.height || OUTPUT_HEIGHT}
                  rotation={overrides.rotation}
                  crop={overrides.crop}
                  aspectMode={overrides.aspectMode}
                  targetAspect={contentTargetAspect(profile.engine, xStyleVideoFrame)}
                  onChange={(crop) => updateOverrides({ crop })}
                />

                <div className="mt-3">
                  <label htmlFor="crop-zoom" className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    Zoom
                  </label>
                  <input
                    id="crop-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={overrides.zoom}
                    onChange={(event) => updateOverrides({ zoom: Number(event.target.value) })}
                    className="w-full accent-accent"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="flex-1 text-[11px] text-muted">
                    Proporção:
                    <select
                      aria-label="Proporção do recorte"
                      value={overrides.aspectMode}
                      onChange={(event) => updateOverrides({ aspectMode: event.target.value as AspectMode })}
                      className="ml-2 h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                    >
                      {ASPECT_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {ASPECT_MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.sourceAnalysis?.hasLetterboxing && (
                    <button
                      type="button"
                      onClick={() => updateOverrides({ crop: draft.sourceAnalysis!.suggestedCrop })}
                      className="shrink-0 text-[11px] font-semibold text-accent"
                    >
                      Usar detecção automática
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => updateOverrides({ crop: { ...FULL_FRAME_CROP }, zoom: 1 })}
                    className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:bg-card-hover"
                  >
                    Redefinir
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAdvancedOpen((current) => !current)}
                  className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-foreground"
                >
                  <ChevronDown size={12} className={advancedOpen ? "rotate-180" : ""} />
                  Ajustes avançados
                </button>
                {advancedOpen && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {CROP_FIELDS.map(({ key, label }) => (
                      <label key={key} className="rounded-lg border border-border bg-card p-2">
                        <span className="mb-1 block text-[10px] text-muted">{label}</span>
                        <span className="flex items-center gap-0.5">
                          <input
                            aria-label={label}
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(overrides.crop[key] * 100)}
                            onChange={(event) => updateCropField(key, Number(event.target.value))}
                            className="h-7 w-full min-w-0 rounded-md border border-border bg-[#111] px-1.5 text-right text-xs tabular-nums text-gray-200 outline-none focus:border-accent"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <SectionLabel>Rotação</SectionLabel>
                  <div className="flex gap-1.5">
                    {ROTATIONS.map((rotation) => (
                      <button
                        key={rotation}
                        type="button"
                        aria-pressed={overrides.rotation === rotation}
                        onClick={() => updateOverrides({ rotation })}
                        className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold ${
                          overrides.rotation === rotation
                            ? "border-accent bg-card-hover text-foreground"
                            : "border-border bg-card text-gray-300"
                        }`}
                      >
                        {rotation}°
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Preenchimento</SectionLabel>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      aria-pressed={overrides.fit === "cover"}
                      onClick={() => updateOverrides({ fit: "cover" })}
                      className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold ${
                        overrides.fit === "cover"
                          ? "border-accent bg-card-hover text-foreground"
                          : "border-border bg-card text-gray-300"
                      }`}
                    >
                      Preencher
                    </button>
                    <button
                      type="button"
                      aria-pressed={overrides.fit === "contain"}
                      onClick={() => updateOverrides({ fit: "contain" })}
                      className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-xs font-semibold ${
                        overrides.fit === "contain"
                          ? "border-accent bg-card-hover text-foreground"
                          : "border-border bg-card text-gray-300"
                      }`}
                    >
                      Ajustar
                    </button>
                  </div>
                </div>
              </div>

              {draft.contentUrl && (
                <div>
                  <SectionLabel>Corte e volume</SectionLabel>
                  <video
                    ref={trimVideoRef}
                    src={draft.contentUrl}
                    controls
                    playsInline
                    onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
                    className="w-full rounded-lg border border-border"
                  />
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-300">
                    <button
                      type="button"
                      onClick={() =>
                        updateOverrides({ trimStart: trimVideoRef.current?.currentTime ?? 0 })
                      }
                      className="rounded-full border border-border bg-card px-2 py-1 hover:bg-card-hover"
                    >
                      Marcar início ({formatTime(overrides.trimStart)})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateOverrides({ trimEnd: trimVideoRef.current?.currentTime ?? duration })
                      }
                      className="rounded-full border border-border bg-card px-2 py-1 hover:bg-card-hover"
                    >
                      Marcar fim ({overrides.trimEnd === null ? "fim" : formatTime(overrides.trimEnd)})
                    </button>
                    <button
                      type="button"
                      aria-label="Redefinir corte"
                      onClick={() => updateOverrides({ trimStart: 0, trimEnd: null })}
                      className="ml-auto rounded-full border border-border bg-card p-1.5 text-gray-400 hover:text-foreground"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={overrides.muted ? "Ativar som" : "Silenciar"}
                      onClick={() => updateOverrides({ muted: !overrides.muted })}
                      className="shrink-0 text-gray-300 hover:text-foreground"
                    >
                      {overrides.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      aria-label="Volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={overrides.volume}
                      onChange={(event) => updateOverrides({ volume: Number(event.target.value) })}
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(event) => setApplyToAll(event.target.checked)}
              className="accent-accent"
            />
            Aplicar a todos os vídeos deste lote
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-gray-300 hover:bg-card-hover"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onSave(draft, applyToAll)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
            >
              {onNext ? "Salvar e ir para o próximo" : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
