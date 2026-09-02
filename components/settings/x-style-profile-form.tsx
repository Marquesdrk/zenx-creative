"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadFile } from "@/lib/editor/upload-file";
import type { XStyleProfile } from "@/lib/editor/types";

export function XStyleProfileForm({
  profile,
  onChange,
}: {
  profile: XStyleProfile;
  onChange: (profile: XStyleProfile) => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  async function handleAvatarSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const url = await uploadFile(file);
    onChange({ ...profile, avatarUrl: url });
  }

  async function handleTemplateSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const url = await uploadFile(file);
      onChange({ ...profile, backgroundImageUrl: url });
    } finally {
      setUploadingTemplate(false);
      if (templateInputRef.current) templateInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Identidade usada no template X Style. A arte pronta vira o fundo, com vídeo centralizado
        e título/texto abaixo no render final.
      </p>

      <div className="grid gap-3 md:grid-cols-[140px_1fr]">
        <div className="aspect-[9/16] overflow-hidden rounded-lg border border-border bg-background">
          {profile.backgroundImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user uploaded template served from /public
            <img src={profile.backgroundImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[11px] text-muted">
              <ImagePlus size={20} />
              Nenhum template importado
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Template do perfil</p>
            <p className="mt-1 text-xs text-muted">
              Importe uma arte vertical 9:16 pronta. Ela será usada como fundo dos vídeos em massa
              deste perfil.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => templateInputRef.current?.click()}
              disabled={uploadingTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus size={14} />
              {uploadingTemplate ? "Importando..." : "Importar template"}
            </button>
            {profile.backgroundImageUrl && (
              <button
                type="button"
                onClick={() => onChange({ ...profile, backgroundImageUrl: null })}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-gray-300 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 size={14} />
                Remover
              </button>
            )}
          </div>
          <input
            ref={templateInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => handleTemplateSelected(event.target.files)}
          />
          <div>
            <p className="mb-1.5 text-xs text-muted">Cor do título e do texto abaixo do vídeo</p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={(profile.textColor ?? "black") === "black"}
                onClick={() => onChange({ ...profile, textColor: "black" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  (profile.textColor ?? "black") === "black"
                    ? "border-accent bg-card-hover text-foreground"
                    : "border-border bg-background text-gray-300"
                }`}
              >
                <span className="h-3 w-3 rounded-full border border-border bg-black" />
                Preto
              </button>
              <button
                type="button"
                aria-pressed={profile.textColor === "white"}
                onClick={() => onChange({ ...profile, textColor: "white" })}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  profile.textColor === "white"
                    ? "border-accent bg-card-hover text-foreground"
                    : "border-border bg-background text-gray-300"
                }`}
              >
                <span className="h-3 w-3 rounded-full border border-border bg-white" />
                Branco
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Use branco em templates de fundo escuro.</p>
          </div>
        </div>
      </div>

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
            onClick={() => avatarInputRef.current?.click()}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-card-hover"
          >
            Enviar foto de perfil
          </button>
          <input
            ref={avatarInputRef}
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

      <div>
        <label htmlFor={`title-${profile.id}`} className="mb-1 block text-xs text-muted">
          Título padrão abaixo do vídeo
        </label>
        <input
          id={`title-${profile.id}`}
          value={profile.defaultTitle ?? ""}
          onChange={(event) => onChange({ ...profile, defaultTitle: event.target.value })}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"
        />
      </div>
    </div>
  );
}
