"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { VideoFrame } from "./video-frame";
import { WatermarkCanvas } from "./watermark-canvas";
import type { EditorVideo, Profile } from "@/lib/editor/types";

export function EditDrawer({
  video,
  profile,
  onClose,
  onSave,
}: {
  video: EditorVideo;
  profile: Profile;
  onClose: () => void;
  onSave: (video: EditorVideo, applyToAll: boolean) => void;
}) {
  const [draft, setDraft] = useState(video);
  const [applyToAll, setApplyToAll] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/60">
      <div className="flex h-full w-[380px] flex-col gap-5 overflow-y-auto border-l border-border bg-[#101010] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Editar vídeo</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-card-hover hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <p className="truncate text-xs text-muted">{draft.filename}</p>

        <div className="w-full max-w-[220px]">
          {profile.template === "shop-content" ? (
            <WatermarkCanvas
              profile={profile}
              video={draft}
              onWatermarkPositionChange={(watermarkPosition) =>
                setDraft((current) => ({ ...current, watermarkPosition }))
              }
            />
          ) : (
            <VideoFrame
              profile={profile}
              caption={draft.caption}
              contentUrl={draft.contentUrl}
              reactionMediaUrl={
                profile.template === "react"
                  ? (profile.reactionMedia.find((r) => r.id === draft.reactionMediaId)?.url ?? null)
                  : null
              }
            />
          )}
        </div>

        {profile.template === "shop-content" && (
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
                value={draft.watermarkPosition.scale}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    watermarkPosition: {
                      ...current.watermarkPosition,
                      scale: Number(event.target.value),
                    },
                  }))
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
                value={draft.watermarkPosition.opacity}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    watermarkPosition: {
                      ...current.watermarkPosition,
                      opacity: Number(event.target.value),
                    },
                  }))
                }
                className="w-full accent-accent"
              />
            </div>
          </div>
        )}

        {profile.template === "react" && profile.reactionMedia.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-muted">Mídia de reação</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.reactionMedia.map((media) => (
                <button
                  key={media.id}
                  type="button"
                  aria-pressed={draft.reactionMediaId === media.id}
                  onClick={() => setDraft((current) => ({ ...current, reactionMediaId: media.id }))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${
                    draft.reactionMediaId === media.id
                      ? "border-accent bg-card-hover text-white"
                      : "border-border bg-card text-gray-300"
                  }`}
                >
                  {media.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {profile.template !== "react" && (
          <div>
            <label htmlFor="caption" className="mb-1 block text-xs text-muted">
              Legenda
            </label>
            <textarea
              id="caption"
              value={draft.caption}
              onChange={(event) =>
                setDraft((current) => ({ ...current, caption: event.target.value }))
              }
              rows={3}
              className="w-full rounded-lg border border-border bg-card p-2 text-sm text-white"
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
              value={draft.cropBox.x}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  cropBox: { ...current.cropBox, x: Number(event.target.value) },
                }))
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
              value={draft.cropBox.y}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  cropBox: { ...current.cropBox, y: Number(event.target.value) },
                }))
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
