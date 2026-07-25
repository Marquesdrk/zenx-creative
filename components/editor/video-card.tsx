import { Pencil, RotateCw } from "lucide-react";
import { VideoFrame } from "./video-frame";
import type { BatchItem, BatchItemStatus, Profile } from "@/lib/editor/types";

const STATUS_LABEL: Record<BatchItemStatus, string> = {
  IMPORTING: "Importando",
  ANALYZING: "Analisando",
  AWAITING_REVIEW: "Aguardando revisão",
  PROCESSING: "Renderizando",
  COMPLETED: "Concluído",
  FAILED: "Erro",
};

const PREVIEWABLE: BatchItemStatus[] = ["AWAITING_REVIEW", "PROCESSING", "COMPLETED"];

export function VideoCard({
  item,
  profile,
  onEdit,
}: {
  item: BatchItem;
  profile: Profile;
  onEdit: () => void;
}) {
  return (
    <div data-testid="video-card" data-status={item.status} className="flex flex-col gap-2">
      <div className="relative">
        {PREVIEWABLE.includes(item.status) ? (
          <VideoFrame
            profile={profile}
            caption={item.manualOverrides.caption}
            contentUrl={item.contentUrl}
            contentCropBox={item.manualOverrides.cropBox}
            watermarkPosition={item.manualOverrides.watermarkPosition}
            reactionMediaUrl={
              profile.engine === "REACT"
                ? (profile.reactionMedia.find((r) => r.id === item.manualOverrides.reactionMediaId)
                    ?.url ?? null)
                : null
            }
          />
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card">
            {item.status !== "FAILED" && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-accent" />
            )}
          </div>
        )}
        <span
          className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            item.status === "COMPLETED"
              ? "bg-[#4CD18A]/15 text-[#4CD18A]"
              : item.status === "FAILED"
                ? "bg-red-500/15 text-red-400"
                : "bg-black/60 text-gray-300"
          }`}
        >
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      <p className="truncate text-[11px] text-muted">{item.filename}</p>
      <div className="flex justify-center">
        {item.status === "AWAITING_REVIEW" ? (
          <button
            type="button"
            aria-label={`Editar ${item.filename}`}
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-gray-300 hover:bg-accent hover:text-background"
          >
            <Pencil size={13} />
          </button>
        ) : item.status === "FAILED" ? (
          <button
            type="button"
            aria-label={`Tentar novamente ${item.filename}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-gray-300 hover:bg-accent hover:text-background"
          >
            <RotateCw size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
