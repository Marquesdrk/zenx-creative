import { VideoFrame } from "./video-frame";
import { resolveWatermarkDefaults } from "@/lib/editor/settings";
import type { EditorTemplate, Profile } from "@/lib/editor/types";

const TEMPLATES: { id: EditorTemplate; label: string; description: string }[] = [
  {
    id: "react",
    label: "React",
    description: "Avatar reagindo em cima, conteúdo recortado automaticamente embaixo.",
  },
  {
    id: "twitter-style",
    label: "Twitter Style",
    description: "Fundo preto, vídeo menor centralizado, estilo tweet.",
  },
  {
    id: "shop-content",
    label: "Shop/Content",
    description: "Tela cheia, marca d'água sutil, legenda \"Link na bio\".",
  },
];

export function TemplatePicker({
  value,
  previewProfile,
  onChange,
}: {
  value: EditorTemplate | null;
  previewProfile: Profile;
  onChange: (template: EditorTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          role="radio"
          aria-checked={value === template.id}
          onClick={() => onChange(template.id)}
          className={`rounded-xl border p-2 text-left transition-colors ${
            value === template.id
              ? "border-accent bg-card-hover"
              : "border-border bg-card hover:bg-card-hover"
          }`}
        >
          <div className="pointer-events-none w-full">
            <VideoFrame
              template={template.id}
              profile={previewProfile}
              caption="Legenda de exemplo"
              watermark={resolveWatermarkDefaults(previewProfile)}
              reactionMedia={previewProfile.reactionMedia[0] ?? null}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-white">{template.label}</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted">{template.description}</p>
        </button>
      ))}
    </div>
  );
}
