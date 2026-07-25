"use client";

import { useRef } from "react";
import { WatermarkCanvas } from "@/components/editor/watermark-canvas";
import { GLOBAL_WATERMARK_DEFAULTS } from "@/lib/editor/settings";
import type { UgcProfile, UgcTemplate, WatermarkPosition } from "@/lib/editor/types";

export function UgcProfileForm({
  profile,
  template,
  onChangeProfile,
  onChangeTemplate,
}: {
  profile: UgcProfile;
  template: UgcTemplate;
  onChangeProfile: (profile: UgcProfile) => void;
  onChangeTemplate: (template: UgcTemplate) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usingGlobalDefault = !template.watermarkDefaults;
  const watermark = template.watermarkDefaults ?? GLOBAL_WATERMARK_DEFAULTS;

  function updateWatermark(patch: Partial<WatermarkPosition>) {
    onChangeTemplate({ ...template, watermarkDefaults: { ...watermark, ...patch } });
  }

  function handleImageSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (profile.watermarkImageUrl) URL.revokeObjectURL(profile.watermarkImageUrl);
    onChangeProfile({ ...profile, watermarkImageUrl: URL.createObjectURL(file) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-xs text-muted">
          Marca d&apos;água personalizada — envie a imagem (de preferência com fundo
          transparente). Sem sigla gerada automaticamente.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            {profile.watermarkImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
              <img
                src={profile.watermarkImageUrl}
                alt=""
                className="max-h-full max-w-full object-contain p-1"
              />
            ) : (
              <span className="text-center text-[9px] text-muted">Sem imagem</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-card-hover"
          >
            Enviar imagem
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleImageSelected(event.target.files)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Posição padrão (template)</h3>
          {!usingGlobalDefault && (
            <button
              type="button"
              onClick={() => onChangeTemplate({ ...template, watermarkDefaults: undefined })}
              className="text-xs text-accent hover:underline"
            >
              Restaurar padrão global
            </button>
          )}
        </div>
        {usingGlobalDefault && (
          <p className="mb-3 text-xs text-muted">
            Este template ainda usa o padrão global. Arraste a marca abaixo para salvar um padrão
            próprio.
          </p>
        )}
        <div className="flex gap-4">
          <div className="w-[140px] shrink-0">
            <WatermarkCanvas
              profile={profile}
              caption="Link na bio"
              contentUrl={null}
              watermarkPosition={watermark}
              onWatermarkPositionChange={(position) =>
                onChangeTemplate({ ...template, watermarkDefaults: position })
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
    </div>
  );
}
