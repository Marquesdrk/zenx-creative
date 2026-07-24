"use client";

import { useRef } from "react";
import type { TwitterStyleProfile } from "@/lib/editor/types";

export function TwitterStyleProfileForm({
  profile,
  onChange,
}: {
  profile: TwitterStyleProfile;
  onChange: (profile: TwitterStyleProfile) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (profile.avatarUrl) URL.revokeObjectURL(profile.avatarUrl);
    onChange({ ...profile, avatarUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Identidade usada no template X Style. Não tem marca d&apos;água — a legenda é reescrita
        com base no tom editorial abaixo.
      </p>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-muted">Sem foto</span>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-card-hover"
          >
            Enviar foto de perfil
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleAvatarSelected(event.target.files)}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`handle-${profile.id}`} className="mb-1 block text-xs text-muted">
          @
        </label>
        <input
          id={`handle-${profile.id}`}
          value={profile.handle}
          onChange={(event) => onChange({ ...profile, handle: event.target.value })}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={profile.verified}
          onChange={(event) => onChange({ ...profile, verified: event.target.checked })}
          className="accent-accent"
        />
        Selo de verificado
      </label>

      <div>
        <label htmlFor={`tone-${profile.id}`} className="mb-1 block text-xs text-muted">
          Tom editorial (reescrita de legenda)
        </label>
        <input
          id={`tone-${profile.id}`}
          value={profile.editorialTone}
          onChange={(event) => onChange({ ...profile, editorialTone: event.target.value })}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"
        />
      </div>
    </div>
  );
}
