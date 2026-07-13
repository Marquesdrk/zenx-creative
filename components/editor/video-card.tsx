import { Pencil, RotateCw } from "lucide-react";
import { VideoFrame } from "./video-frame";
import type { EditorTemplate, EditorVideo, Profile } from "@/lib/editor/types";

const STATUS_LABEL: Record<EditorVideo["status"], string> = {
  importing: "Importando",
  processing: "Processando",
  ready: "Pronto",
  error: "Erro",
};

export function VideoCard({
  video,
  profile,
  template,
  onEdit,
}: {
  video: EditorVideo;
  profile: Profile;
  template: EditorTemplate;
  onEdit: () => void;
}) {
  return (
    <div data-testid="video-card" data-status={video.status} className="flex flex-col gap-2">
      <div className="relative">
        {video.status === "ready" ? (
          <VideoFrame
            template={template}
            profile={profile}
            caption={video.caption}
            contentUrl={video.contentUrl}
            watermark={video.watermarkPosition}
            reactionMedia={
              profile.reactionMedia.find((r) => r.id === video.reactionMediaId) ?? null
            }
          />
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card">
            {video.status !== "error" && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
            )}
          </div>
        )}
        <span
          className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            video.status === "ready"
              ? "bg-[#4CD18A]/15 text-[#4CD18A]"
              : video.status === "error"
                ? "bg-red-500/15 text-red-400"
                : "bg-black/60 text-gray-300"
          }`}
        >
          {STATUS_LABEL[video.status]}
        </span>
      </div>
      <p className="truncate text-[11px] text-muted">{video.filename}</p>
      <div className="flex justify-center">
        {video.status === "ready" ? (
          <button
            type="button"
            aria-label={`Editar ${video.filename}`}
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-gray-300 hover:bg-accent hover:text-background"
          >
            <Pencil size={13} />
          </button>
        ) : video.status === "error" ? (
          <button
            type="button"
            aria-label={`Tentar novamente ${video.filename}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-gray-300 hover:bg-accent hover:text-background"
          >
            <RotateCw size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
