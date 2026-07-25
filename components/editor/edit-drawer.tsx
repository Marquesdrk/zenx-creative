"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { VideoFrame } from "./video-frame";
import { WatermarkCanvas } from "./watermark-canvas";
import type { BatchItem, Profile, Rotation } from "@/lib/editor/types";

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

  async function handleRedetect() {
    if (!draft.contentUrl) return;
    setRedetecting(true);
    const analysis = await analyzeVideoSource(draft.contentUrl);
    setDraft((current) => ({
      ...current,
      sourceAnalysis: analysis,
      manualOverrides: { ...current.manualOverrides, cropBox: analysis.suggestedCropBox },
    }));
    setRedetecting(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/60">
      <div className="flex h-full w-[380px] flex-col gap-5 overflow-y-auto border-l border-border bg-[#101010] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Editar vídeo</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-card-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <p className="truncate text-xs text-muted">{draft.filename}</p>

        <div className="w-full max-w-[220px]">
          {profile.engine === "UGC" ? (
            <WatermarkCanvas
              profile={profile}
              caption={overrides.caption}
              contentUrl={draft.contentUrl}
              contentCropBox={overrides.cropBox}
              contentCropZoom={overrides.cropZoom}
              contentFit={overrides.fit}
              contentRotation={overrides.rotation}
              watermarkPosition={overrides.watermarkPosition}
              onWatermarkPositionChange={(watermarkPosition) => updateOverrides({ watermarkPosition })}
            />
          ) : (
            <VideoFrame
              profile={profile}
              caption={overrides.caption}
              contentUrl={draft.contentUrl}
              contentCropBox={overrides.cropBox}
              contentCropZoom={overrides.cropZoom}
              contentFit={overrides.fit}
              contentRotation={overrides.rotation}
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
          <div className="flex items-center justify-between gap-2">
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

        {profile.engine === "UGC" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="watermark-scale" className="mb-1 block text-xs text-muted">
                Tamanho da marca
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
                Opacidade da marca
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
        )}

        {profile.engine === "REACT" && profile.reactionMedia.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-muted">Mídia de reação</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.reactionMedia.map((media) => (
                <button
                  key={media.id}
                  type="button"
                  aria-pressed={overrides.reactionMediaId === media.id}
                  onClick={() => updateOverrides({ reactionMediaId: media.id })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    overrides.reactionMediaId === media.id
                      ? "border-accent bg-card-hover text-foreground"
                      : "border-border bg-card text-gray-300"
                  }`}
                >
                  {media.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {profile.engine !== "REACT" && (
          <div>
            <label htmlFor="caption" className="mb-1 block text-xs text-muted">
              Legenda
            </label>
            <textarea
              id="caption"
              value={overrides.caption}
              onChange={(event) => updateOverrides({ caption: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-card p-2 text-sm text-foreground"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="crop-x" className="mb-1 block text-xs text-muted">
              Recorte horizontal
            </label>
            <input
              id="crop-x"
              type="range"
              min={0}
              max={100}
              value={Math.round(overrides.cropBox.x * 100)}
              onChange={(event) =>
                updateOverrides({
                  cropBox: { ...overrides.cropBox, x: Number(event.target.value) / 100 },
                })
              }
              className="w-full accent-accent"
            />
          </div>
          <div>
            <label htmlFor="crop-y" className="mb-1 block text-xs text-muted">
              Recorte vertical
            </label>
            <input
              id="crop-y"
              type="range"
              min={0}
              max={100}
              value={Math.round(overrides.cropBox.y * 100)}
              onChange={(event) =>
                updateOverrides({
                  cropBox: { ...overrides.cropBox, y: Number(event.target.value) / 100 },
                })
              }
              className="w-full accent-accent"
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted">Zoom (recorte livre)</p>
          <input
            id="crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={overrides.cropZoom}
            onChange={(event) => updateOverrides({ cropZoom: Number(event.target.value) })}
            className="w-full accent-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-xs text-muted">Rotação</p>
            <div className="flex gap-1.5">
              {ROTATIONS.map((rotation) => (
                <button
                  key={rotation}
                  type="button"
                  aria-pressed={overrides.rotation === rotation}
                  onClick={() => updateOverrides({ rotation })}
                  className={`flex h-7 flex-1 items-center justify-center rounded-lg border text-[10px] font-semibold ${
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
            <p className="mb-1 text-xs text-muted">Preenchimento</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                aria-pressed={overrides.fit === "cover"}
                onClick={() => updateOverrides({ fit: "cover" })}
                className={`flex h-7 flex-1 items-center justify-center rounded-lg border text-[10px] font-semibold ${
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
                className={`flex h-7 flex-1 items-center justify-center rounded-lg border text-[10px] font-semibold ${
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
            <p className="mb-1.5 text-xs text-muted">Corte e volume</p>
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

        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(event) => setApplyToAll(event.target.checked)}
            className="accent-accent"
          />
          Aplicar a todos os vídeos deste lote
        </label>

        <div className="mt-auto flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-gray-300 hover:bg-card-hover"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave(draft, applyToAll)}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-background"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
