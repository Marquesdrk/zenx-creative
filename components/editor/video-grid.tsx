import { VideoCard } from "./video-card";
import { computeBatchStatus, ENGINE_LABELS } from "@/lib/editor/types";
import type { Batch, BatchItem, Profile } from "@/lib/editor/types";

export function VideoGrid({
  items,
  batches,
  profiles,
  onEdit,
  onConfirmBatch,
}: {
  items: BatchItem[];
  batches: Batch[];
  profiles: Profile[];
  onEdit: (item: BatchItem) => void;
  onConfirmBatch: (batchId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        Nenhum vídeo importado ainda. Clique em &quot;+ Novo lote&quot; para começar.
      </div>
    );
  }

  // Lotes mais recentes primeiro.
  const orderedBatches = [...batches].reverse();

  return (
    <div className="flex flex-col gap-6">
      {orderedBatches.map((batch) => {
        const batchItems = items.filter((item) => item.batchId === batch.id);
        if (batchItems.length === 0) return null;
        const profile = profiles.find((p) => p.id === batch.profileId);
        if (!profile) return null;
        const canConfirm = computeBatchStatus(batchItems) === "AWAITING_REVIEW";

        return (
          <div key={batch.id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-muted">
                <span className="font-semibold text-foreground">{profile.name}</span> ·{" "}
                {ENGINE_LABELS[batch.engine]} · {batchItems.length} vídeo(s)
              </p>
              {canConfirm && (
                <button
                  type="button"
                  onClick={() => onConfirmBatch(batch.id)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-background"
                >
                  Confirmar lote
                </button>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {batchItems.map((item) => (
                <VideoCard
                  key={item.id}
                  item={item}
                  profile={profile}
                  onEdit={() => onEdit(item)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
