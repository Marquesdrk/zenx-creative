"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { VideoFrame } from "./video-frame";
import { WatermarkCanvas } from "./watermark-canvas";
import type { BatchItem, Profile } from "@/lib/editor/types";

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
  const overrides = draft.manualOverrides;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function updateOverrides(patch: Partial<BatchItem["manualOverrides"]>) {
    setDraft((current) => ({
      ...current,
      manualOverrides: { ...current.manualOverrides, ...patch },
    }));
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
              watermarkPosition={overrides.watermarkPosition}
              onWatermarkPositionChange={(watermarkPosition) => updateOverrides({ watermarkPosition })}
            />
          ) : (
            <VideoFrame
              profile={profile}
              caption={overrides.caption}
              contentUrl={draft.contentUrl}
              contentCropBox={overrides.cropBox}
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
          <p className="text-[11px] text-muted">
            {draft.sourceAnalysis.width}×{draft.sourceAnalysis.height}px
            {draft.sourceAnalysis.hasLetterboxing ? " · barras detectadas, recorte sugerido" : ""}
          </p>
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
