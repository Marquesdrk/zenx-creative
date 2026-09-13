"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, UserRound } from "lucide-react";
import { ReactProfileForm } from "./react-profile-form";
import { XStyleProfileForm } from "./x-style-profile-form";
import { UgcProfileForm } from "./ugc-profile-form";
import { uploadFile } from "@/lib/editor/upload-file";
import { ENGINE_LABELS, type Profile, type Template } from "@/lib/editor/types";

export function ProfileSettingsForm({
  profile,
  template,
  onChangeProfile,
  onChangeTemplate,
  onDelete,
  canDelete,
}: {
  profile: Profile;
  template: Template | null;
  onChangeProfile: (profile: Profile) => void;
  onChangeTemplate: (template: Template) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <label htmlFor={`name-${profile.id}`} className="mb-1 block text-xs text-muted">
            Nome de exibição · <span className="text-accent">{ENGINE_LABELS[profile.engine]}</span>
          </label>
          <input
            id={`name-${profile.id}`}
            value={profile.name}
            onChange={(event) => onChangeProfile({ ...profile, name: event.target.value })}
            className="w-full max-w-xs rounded-lg border border-border bg-background p-2 text-sm text-foreground"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label={`Remover perfil ${profile.name}`}
          className="mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-gray-400 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <ProfilePictureField profile={profile} onChange={onChangeProfile} />

      <div className="border-t border-border pt-4">
        <label htmlFor={`handle-${profile.id}`} className="mb-1 block text-xs text-muted">
          @ do perfil no Instagram
        </label>
        <input
          id={`handle-${profile.id}`}
          value={profile.handle ?? ""}
          onChange={(event) => onChangeProfile({ ...profile, handle: event.target.value.startsWith("@") ? event.target.value : `@${event.target.value}` })}
          placeholder="@seuperfil"
          className="w-full max-w-xs rounded-lg border border-border bg-background p-2 text-sm text-foreground"
        />
        <p className="mt-1 text-[11px] text-muted">Usado para identificar a conta e orientar o aceite do convite.</p>
      </div>

      <div className="border-t border-border pt-5">
        {profile.engine === "REACT" && (
          <ReactProfileForm profile={profile} onChange={onChangeProfile} />
        )}
        {profile.engine === "X_STYLE" && (
          <XStyleProfileForm profile={profile} onChange={onChangeProfile} />
        )}
        {profile.engine === "UGC" &&
          (template && template.engine === "UGC" ? (
            <UgcProfileForm
              profile={profile}
              template={template}
              onChangeProfile={onChangeProfile}
              onChangeTemplate={onChangeTemplate}
            />
          ) : (
            <p className="text-xs text-muted">Template não encontrado para este perfil.</p>
          ))}
      </div>
    </div>
  );
}

function ProfilePictureField({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageUrl = profile.profilePictureUrl ?? ("avatarUrl" in profile ? profile.avatarUrl : null);

  async function selectPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("A foto precisa ter no máximo 10 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const url = await uploadFile(file);
      onChange(profile.engine === "X_STYLE"
        ? { ...profile, profilePictureUrl: url, avatarUrl: url }
        : { ...profile, profilePictureUrl: url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removePhoto() {
    onChange(profile.engine === "X_STYLE"
      ? { ...profile, profilePictureUrl: null, avatarUrl: null }
      : { ...profile, profilePictureUrl: null });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-card-hover text-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto enviada ao armazenamento do app
          <img src={imageUrl} alt={`Foto de ${profile.name}`} className="h-full w-full object-cover" />
        ) : (
          <UserRound size={22} />
        )}
      </div>
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-medium text-foreground">Foto do perfil</p>
        <p className="mt-0.5 text-xs text-muted">Usada nos cards do relatório. Se não enviar, tentamos usar a foto da conta social vinculada.</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            <ImagePlus size={13} /> {uploading ? "Enviando…" : imageUrl ? "Trocar foto" : "Enviar foto"}
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={removePhoto}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted hover:text-red-300"
            >
              <Trash2 size={13} /> Remover
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-1.5 text-xs text-red-300">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(event) => void selectPhoto(event.target.files)}
      />
    </div>
  );
}
