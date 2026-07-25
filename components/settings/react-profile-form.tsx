"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import type { ReactProfile, ReactionMedia } from "@/lib/editor/types";

export function ReactProfileForm({
  profile,
  onChange,
}: {
  profile: ReactProfile;
  onChange: (profile: ReactProfile) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newMedia: ReactionMedia[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      label: file.name,
      url: URL.createObjectURL(file),
    }));
    onChange({ ...profile, reactionMedia: [...profile.reactionMedia, ...newMedia] });
  }

  function updateMedia(id: string, patch: Partial<ReactionMedia>) {
    onChange({
      ...profile,
      reactionMedia: profile.reactionMedia.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  function removeMedia(id: string) {
    const media = profile.reactionMedia.find((m) => m.id === id);
    if (media?.url) URL.revokeObjectURL(media.url);
    onChange({ ...profile, reactionMedia: profile.reactionMedia.filter((m) => m.id !== id) });
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">Mídias de reação do influencer</h3>
      <p className="mb-3 text-xs text-muted">
        Enviadas uma vez aqui e reaproveitadas automaticamente em todo lote com este perfil, sem
        precisar reimportar. O template React não usa marca d&apos;água.
      </p>
      <div className="grid grid-cols-5 gap-3">
        {profile.reactionMedia.map((media) => (
          <div key={media.id} className="flex flex-col gap-1.5">
            <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black">
              {media.url && (
                <video src={media.url} muted playsInline className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                aria-label={`Remover mídia ${media.label}`}
                onClick={() => removeMedia(media.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-foreground hover:bg-red-500/70"
              >
                <Trash2 size={11} />
              </button>
            </div>
            <input
              value={media.label}
              onChange={(event) => updateMedia(media.id, { label: event.target.value })}
              className="rounded-lg border border-border bg-background p-1.5 text-xs text-foreground"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted hover:border-accent hover:text-foreground"
        >
          + Adicionar
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*"
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />
    </div>
  );
}
