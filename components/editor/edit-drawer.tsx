"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { CropEditor } from "./crop-editor";
import { VideoFrame } from "./video-frame";
import { WatermarkCanvas } from "./watermark-canvas";
import {
  resolveXStyleLayout,
  type BatchItem,
  type Engine,
  type Profile,
  type Rotation,
  type XStyleVideoFrame,
} from "@/lib/editor/types";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const REACT_REACTION_HEIGHT_RATIO = 0.36;

/** Mesma proporção usada pelo render real (lib/server/render.ts) por engine — o editor
 *  visual de recorte precisa mirar exatamente nisso, não em qualquer aspecto genérico. */
function contentTargetAspect(engine: Engine, xStyleVideoFrame?: XStyleVideoFrame | null): number {
  if (engine === "REACT") {
    const topHeight = Math.round(OUTPUT_HEIGHT * REACT_REACTION_HEIGHT_RATIO);
    return OUTPUT_WIDTH / (OUTPUT_HEIGHT - topHeight);
  }
  if (engine === "X_STYLE") {
    const frame = xStyleVideoFrame ?? resolveXStyleLayout().video;
    return frame.width / frame.height;
  }
  return OUTPUT_WIDTH / OUTPUT_HEIGHT;
}

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
}: {
  item: BatchItem;
  profile: Profile;
  onClose: () => void;
  onSave: (item: BatchItem, applyToAll: boolean) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [applyToAll, setApplyToAll] = useState(false);
  const [duration, setDuration] = useState(0);
  const [redetecting, setRedetecting] = useState(false);
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

  const defaultXStyleVideoFrame =
    profile.engine === "X_STYLE" ? resolveXStyleLayout(profile.xStyleLayout).video : null;
  const xStyleVideoFrame = overrides.xStyleVideoFrame ?? defaultXStyleVideoFrame;

  function updateXStyleVideoFrame(patch: Partial<XStyleVideoFrame>) {
    if (!xStyleVideoFrame) return;
    const next = {
      ...xStyleVideoFrame,
      ...patch,
    };
    next.width = Math.round(Math.min(980, Math.max(240, next.width)));
    next.height = Math.round(Math.min(1300, Math.max(180, next.height)));
    next.x = Math.round(Math.min(1080 - next.width, Math.max(0, next.x)));
    next.y = Math.round(Math.min(1920 - next.height, Math.max(0, next.y)));
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
        cropBox: analysis.suggestedCropBox,
        cropZoom: analysis.suggestedZoom,
      },
    }));
    setRedetecting(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[92vh] w-[980px] flex-col overflow-hidden rounded-2xl border border-border bg-[#101010]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Editar vídeo</h2>
            <p className="truncate text-xs text-muted">{draft.filename}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-card-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Prévia — maior e fixa, pra dar uma ideia clara e parada de como o vídeo final vai ficar. */}
          <div className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-black/30 p-6">
            <div className="mx-auto w-full max-w-[280px]">
              {profile.engine === "UGC" ? (
                <WatermarkCanvas
                  profile={profile}
                  caption={overrides.caption}
                  contentUrl={draft.contentUrl}
                  contentCropBox={overrides.cropBox}
                  contentCropZoom={overrides.cropZoom}
                  contentFit={overrides.fit}
                  contentRotation={overrides.rotation}
                  onContentPositionChange={(cropBox) => updateOverrides({ cropBox })}
                  watermarkPosition={overrides.watermarkPosition}
                  onWatermarkPositionChange={(watermarkPosition) => updateOverrides({ watermarkPosition })}
                />
              ) : (
                <VideoFrame
                  profile={profile}
                  title={overrides.title}
                  caption={overrides.caption}
                  contentUrl={draft.contentUrl}
                  contentCropBox={overrides.cropBox}
                  contentCropZoom={overrides.cropZoom}
                  contentFit={overrides.fit}
                  contentRotation={overrides.rotation}
                  xStyleVideoFrame={overrides.xStyleVideoFrame}
                  onContentPositionChange={(cropBox) => updateOverrides({ cropBox })}
                  reactionMediaUrl={
                    profile.engine === "REACT"
                      ? (profile.reactionMedia.find((r) => r.id === overrides.reactionMediaId)?.url ??
                        null)
                      : null
                  }
                />
              )}
            </div>

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
                    <SectionLabel>Área do vídeo no template</SectionLabel>
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
                      ["width", "Largura", 240, 980],
                      ["height", "Altura", 180, 1300],
                    ] as const).map(([key, label, min, max]) => (
                      <label key={key} className="rounded-lg border border-border bg-card p-3">
                        <span className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                          {label}
                          <span className="tabular-nums text-gray-300">{xStyleVideoFrame[key]}px</span>
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
                  <SectionLabel>Recorte</SectionLabel>
                  <span className="text-[11px] tabular-nums text-gray-400">
                    {overrides.cropZoom.toFixed(1)}×
                  </span>
                </div>
                <p className="mb-2 -mt-1 text-[11px] text-muted">
                  Arraste o quadro pra reposicionar, puxe o canto pra recortar mais ou menos.
                </p>
                <CropEditor
                  contentUrl={draft.contentUrl}
                  sourceWidth={draft.sourceAnalysis?.width || OUTPUT_WIDTH}
                  sourceHeight={draft.sourceAnalysis?.height || OUTPUT_HEIGHT}
                  rotation={overrides.rotation}
                  targetAspect={contentTargetAspect(profile.engine, xStyleVideoFrame)}
                  cropBox={overrides.cropBox}
                  cropZoom={overrides.cropZoom}
                  onChange={({ cropBox, zoom }) => updateOverrides({ cropBox, cropZoom: zoom })}
                />
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
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
