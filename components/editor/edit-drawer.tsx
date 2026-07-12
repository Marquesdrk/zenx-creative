"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { WatermarkCanvas } from "./watermark-canvas";
import type { EditorTemplate, EditorVideo, Profile } from "@/lib/editor/types";

export function EditDrawer({
  video,
  profile,
  template,
  onClose,
  onSave,
}: {
  video: EditorVideo;
  profile: Profile;
  template: EditorTemplate;
  onClose: () => void;
  onSave: (video: EditorVideo) => void;
}) {
  const [draft, setDraft] = useState(video);

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
          <WatermarkCanvas
            template={template}
            profile={profile}
            video={draft}
            onWatermarkPositionChange={(watermarkPosition) =>
              setDraft((current) => ({ ...current, watermarkPosition }))
            }
          />
        </div>

        <div>
          <label htmlFor="watermark-scale" className="mb-1 block text-xs text-muted">
            Tamanho da marca d&apos;água
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
          <label htmlFor="caption" className="mb-1 block text-xs text-muted">
            Legenda
          </label>
          <textarea
            id="caption"
            value={draft.caption}
            onChange={(event) => setDraft((current) => ({ ...current, caption: event.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-border bg-card p-2 text-sm text-white"
          />
        </div>

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
            onClick={() => onSave(draft)}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-background"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
