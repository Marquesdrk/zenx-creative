"use client";

import { useRef, useState } from "react";
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: crypto.randomUUID(),
          label: file.name,
          ...(await uploadReactionToDrive(file)),
        }))
      );
      onChange({ ...profile, reactionMedia: [...profile.reactionMedia, ...uploaded] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível salvar os vídeos.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function uploadReactionToDrive(file: File): Promise<{ url: string; driveFileId: string }> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("profileHandle", profile.handle ?? profile.name);
    const response = await fetch("/api/drive/reaction-media", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { url?: string; fileId?: string; error?: string } | null;
    if (!response.ok || !payload?.url || !payload.fileId) {
      throw new Error(payload?.error || "Falha ao salvar a mídia no Google Drive.");
    }
    return { url: payload.url, driveFileId: payload.fileId };
  }

  function updateMedia(id: string, patch: Partial<ReactionMedia>) {
    onChange({
      ...profile,
      reactionMedia: profile.reactionMedia.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  function removeMedia(id: string) {
    onChange({ ...profile, reactionMedia: profile.reactionMedia.filter((m) => m.id !== id) });
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">Mídias de reação do influencer</h3>
      <p className="mb-3 text-xs text-muted">
        Salvas no Google Drive em uma pasta própria do perfil e reaproveitadas automaticamente em
        todo lote, sem precisar reimportar. O template React não usa marca d&apos;água.
      </p>
      <div className="grid grid-cols-5 gap-3">
        {profile.reactionMedia.map((media) => (
          <div key={media.id} className="flex flex-col gap-1.5">
            <div className="relative aspect-[9/8] overflow-hidden rounded-lg border border-border bg-black">
              {media.url && (
                <video
                  src={media.url}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (Number.isFinite(video.duration)) video.currentTime = Math.min(1, video.duration / 2);
                  }}
                  onLoadedData={(event) => void event.currentTarget.play().catch(() => undefined)}
                  className="h-full w-full object-cover"
                />
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
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-[9/8] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted hover:border-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50"
        >
          {uploading ? "Salvando…" : "+ Adicionar"}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={(event) => handleFilesSelected(event.target.files)}
      />
      {uploadError && <p className="mt-2 text-xs text-red-300">{uploadError}</p>}
    </div>
  );
}
