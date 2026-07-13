"use client";

import { Trash2 } from "lucide-react";
import { WatermarkCanvas } from "@/components/editor/watermark-canvas";
import { GLOBAL_WATERMARK_DEFAULTS } from "@/lib/editor/settings";
import type { EditorVideo, Profile, ReactionMedia } from "@/lib/editor/types";

const REACTION_COLORS = ["#6C7BFF", "#F49D37", "#4CD18A", "#F45B69", "#7FE0B0", "#9AA6FF"];

/** Vídeo sintético só para alimentar o WatermarkCanvas nesta tela de configurações
 *  (não existe um vídeo de verdade aqui — é só uma prévia da posição da marca). */
function previewVideo(profile: Profile): EditorVideo {
  return {
    id: "preview",
    batchId: "preview",
    filename: "",
    status: "ready",
    caption: "Link na bio",
    watermarkPosition: profile.watermarkDefaults ?? GLOBAL_WATERMARK_DEFAULTS,
    cropBox: { x: 50, y: 50 },
    reactionMediaId: null,
    contentUrl: null,
  };
}

export function ProfileSettingsForm({
  profile,
  onChange,
  onDelete,
  canDelete,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const usingGlobalDefault = !profile.watermarkDefaults;
  const watermark = profile.watermarkDefaults ?? GLOBAL_WATERMARK_DEFAULTS;

  function updateWatermark(patch: Partial<typeof watermark>) {
    onChange({ ...profile, watermarkDefaults: { ...watermark, ...patch } });
  }

  function addReactionMedia() {
    const media: ReactionMedia = {
      id: crypto.randomUUID(),
      label: "Nova reação",
      color: REACTION_COLORS[profile.reactionMedia.length % REACTION_COLORS.length],
    };
    onChange({ ...profile, reactionMedia: [...profile.reactionMedia, media] });
  }

  function updateReactionMedia(id: string, patch: Partial<ReactionMedia>) {
    onChange({
      ...profile,
      reactionMedia: profile.reactionMedia.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  function removeReactionMedia(id: string) {
    onChange({ ...profile, reactionMedia: profile.reactionMedia.filter((m) => m.id !== id) });
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Identidade</h3>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={`Remover perfil ${profile.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-gray-400 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`name-${profile.id}`} className="mb-1 block text-xs text-muted">
            Nome de exibição
          </label>
          <input
            id={`name-${profile.id}`}
            value={profile.name}
            onChange={(event) => onChange({ ...profile, name: event.target.value })}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm text-white"
          />
        </div>
        <div>
          <label htmlFor={`handle-${profile.id}`} className="mb-1 block text-xs text-muted">
            @
          </label>
          <input
            id={`handle-${profile.id}`}
            value={profile.handle}
            onChange={(event) => onChange({ ...profile, handle: event.target.value })}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm text-white"
          />
        </div>
        <div>
          <label htmlFor={`watermark-label-${profile.id}`} className="mb-1 block text-xs text-muted">
            Sigla da marca d&apos;água
          </label>
          <input
            id={`watermark-label-${profile.id}`}
            value={profile.watermarkLabel}
            maxLength={4}
            onChange={(event) =>
              onChange({ ...profile, watermarkLabel: event.target.value.toUpperCase() })
            }
            className="w-full rounded-lg border border-border bg-background p-2 text-sm text-white"
          />
        </div>
        <div>
          <label htmlFor={`avatar-color-${profile.id}`} className="mb-1 block text-xs text-muted">
            Cor do avatar
          </label>
          <input
            id={`avatar-color-${profile.id}`}
            type="color"
            value={profile.avatarColor}
            onChange={(event) => onChange({ ...profile, avatarColor: event.target.value })}
            className="h-9 w-full rounded-lg border border-border bg-background p-1"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={profile.verified}
          onChange={(event) => onChange({ ...profile, verified: event.target.checked })}
          className="accent-accent"
        />
        Selo de verificado (X Style)
      </label>

      <div>
        <label htmlFor={`tone-${profile.id}`} className="mb-1 block text-xs text-muted">
          Tom editorial (reescrita de legenda no X Style)
        </label>
        <input
          id={`tone-${profile.id}`}
          value={profile.editorialTone}
          onChange={(event) => onChange({ ...profile, editorialTone: event.target.value })}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm text-white"
        />
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Marca d&apos;água padrão</h3>
          {!usingGlobalDefault && (
            <button
              type="button"
              onClick={() => onChange({ ...profile, watermarkDefaults: undefined })}
              className="text-xs text-accent hover:underline"
            >
              Restaurar padrão global
            </button>
          )}
        </div>
        {usingGlobalDefault && (
          <p className="mb-3 text-xs text-muted">
            Este perfil ainda usa o padrão global. Arraste a marca abaixo para salvar um padrão
            próprio.
          </p>
        )}
        <div className="flex gap-4">
          <div className="w-[140px] shrink-0">
            <WatermarkCanvas
              template="shop-content"
              profile={profile}
              video={previewVideo(profile)}
              onWatermarkPositionChange={(position) =>
                onChange({ ...profile, watermarkDefaults: position })
              }
            />
          </div>
          <div className="flex flex-1 flex-col justify-center gap-3">
            <div>
              <label htmlFor={`scale-${profile.id}`} className="mb-1 block text-xs text-muted">
                Tamanho
              </label>
              <input
                id={`scale-${profile.id}`}
                type="range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={watermark.scale}
                onChange={(event) => updateWatermark({ scale: Number(event.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <label htmlFor={`opacity-${profile.id}`} className="mb-1 block text-xs text-muted">
                Opacidade
              </label>
              <input
                id={`opacity-${profile.id}`}
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={watermark.opacity}
                onChange={(event) => updateWatermark({ opacity: Number(event.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="mb-1 text-sm font-semibold text-white">Mídias de reação (template React)</h3>
        <p className="mb-3 text-xs text-muted">
          Carregadas automaticamente ao criar um lote com o template React — sem precisar
          reimportar.
        </p>
        <div className="flex flex-col gap-2">
          {profile.reactionMedia.map((media) => (
            <div key={media.id} className="flex items-center gap-2">
              <span
                className="h-6 w-6 shrink-0 rounded-full"
                style={{ backgroundColor: media.color }}
              />
              <input
                value={media.label}
                onChange={(event) => updateReactionMedia(media.id, { label: event.target.value })}
                className="flex-1 rounded-lg border border-border bg-background p-2 text-sm text-white"
              />
              <button
                type="button"
                aria-label={`Remover mídia ${media.label}`}
                onClick={() => removeReactionMedia(media.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-gray-400 hover:bg-red-500/15 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addReactionMedia}
          className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-white"
        >
          + Adicionar mídia de reação
        </button>
      </div>
    </div>
  );
}
