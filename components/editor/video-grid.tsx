import { Download, Loader2 } from "lucide-react";
import { VideoCard } from "./video-card";
import { computeBatchStatus, ENGINE_LABELS } from "@/lib/editor/types";
import type { Batch, BatchItem, Profile } from "@/lib/editor/types";

export function VideoGrid({
  items,
  batches,
  profiles,
  onEdit,
  onDeleteItem,
  onConfirmBatch,
  onExportBatch,
  exportingBatchId,
}: {
  items: BatchItem[];
  batches: Batch[];
  profiles: Profile[];
  onEdit: (item: BatchItem) => void;
  onDeleteItem: (item: BatchItem) => void;
  onConfirmBatch: (batchId: string) => void;
  onExportBatch: (batchId: string) => void;
  exportingBatchId: string | null;
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
          <section key={batch.id} className="rounded-xl border border-border bg-[#0d0d0d]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{profile.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {ENGINE_LABELS[batch.engine]} · {batchItems.length} vídeo(s) ·{" "}
                  {batchItems.filter((item) => item.status === "COMPLETED").length} renderizado(s)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canConfirm && (
                  <button
                    type="button"
                    onClick={() => onConfirmBatch(batch.id)}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background"
                  >
                    Confirmar lote
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onExportBatch(batch.id)}
                  disabled={
                    exportingBatchId === batch.id ||
                    !batchItems.some((item) => item.status === "COMPLETED")
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {exportingBatchId === batch.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  Mover para Publicar
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 p-4">
              {batchItems.map((item) => (
                <VideoCard
                  key={item.id}
                  item={item}
                  profile={profile}
                  onEdit={() => onEdit(item)}
                  onDelete={() => onDeleteItem(item)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
