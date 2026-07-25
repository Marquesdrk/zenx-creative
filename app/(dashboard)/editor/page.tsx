"use client";

import { useEffect, useRef, useState } from "react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { VideoGrid } from "@/components/editor/video-grid";
import { useProfiles } from "@/lib/editor/profiles-store";
import { useTemplates } from "@/lib/editor/templates-store";
import { scheduleImportAnalysis, scheduleRender } from "@/lib/editor/mock-processing";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import type { Batch, BatchItem, Profile } from "@/lib/editor/types";

function generateCaption(filename: string, profile: Profile) {
  if (profile.engine === "UGC") return "Link na bio";
  if (profile.engine === "X_STYLE") {
    return `${profile.editorialTone} — legenda original de ${filename}, transcrita e reescrita mantendo o mesmo assunto.`;
  }
  return `Legenda gerada automaticamente a partir de ${filename}`;
}

export default function EditorPage() {
  const [profiles] = useProfiles();
  const [templates] = useTemplates();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [sentToDriveCount, setSentToDriveCount] = useState(0);
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const cleanupsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  function handleBatchSubmit(params: { profileId: string; files: BatchSourceFile[] }) {
    const profile = profiles.find((p) => p.id === params.profileId);
    if (!profile) return;

    const batch: Batch = {
      id: crypto.randomUUID(),
      profileId: params.profileId,
      engine: profile.engine,
      createdAt: new Date().toISOString(),
    };

    // Nível 2 (padrão do template) substitui o nível 1 (padrão global) quando definido.
    // Só é relevante para perfis UGC; os demais engines não têm marca d'água.
    const template = templates.find((t) => t.id === profile.templateId);
    const watermarkDefaults =
      profile.engine === "UGC" && template?.engine === "UGC"
        ? resolveWatermarkDefaults(template)
        : GLOBAL_WATERMARK_DEFAULTS;

    const newItems: BatchItem[] = params.files.map(({ name: filename, url }, index) => ({
      id: crypto.randomUUID(),
      batchId: batch.id,
      filename,
      status: "IMPORTING",
      manualOverrides: {
        caption: generateCaption(filename, profile),
        watermarkPosition: { ...watermarkDefaults },
        cropBox: { x: 0.5, y: 0.5 },
        // Engine React carrega automaticamente as mídias de reação salvas do perfil.
        reactionMediaId:
          profile.engine === "REACT" && profile.reactionMedia.length > 0
            ? profile.reactionMedia[index % profile.reactionMedia.length].id
            : null,
      },
      sourceAnalysis: null,
      contentUrl: url,
    }));

    setBatches((current) => [...current, batch]);
    setItems((current) => [...newItems, ...current]);
    setBatchModalOpen(false);

    newItems.forEach((item, index) => {
      const cleanup = scheduleImportAnalysis(index, item.contentUrl, (result) => {
        setItems((current) =>
          current.map((i) => {
            if (i.id !== item.id) return i;
            if (result.status === "ANALYZING") return { ...i, status: "ANALYZING" };
            // A normalização sugere um recorte (fase 3) — aplicado como ponto de partida,
            // o usuário ainda pode ajustar no editor rápido.
            return {
              ...i,
              status: "AWAITING_REVIEW",
              sourceAnalysis: result.analysis,
              manualOverrides: result.analysis
                ? { ...i.manualOverrides, cropBox: result.analysis.suggestedCropBox }
                : i.manualOverrides,
            };
          })
        );
      });
      cleanupsRef.current.push(cleanup);
    });
  }

  function handleConfirmBatch(batchId: string) {
    const pendingItems = items.filter(
      (i) => i.batchId === batchId && i.status === "AWAITING_REVIEW"
    );

    pendingItems.forEach((item, index) => {
      const cleanup = scheduleRender(index, (status) => {
        if (status === "COMPLETED") {
          // Item concluído é considerado entregue ao Google Drive: sai da grade ativa.
          setSentToDriveCount((count) => count + 1);
          setItems((current) => current.filter((i) => i.id !== item.id));
          if (item.contentUrl) URL.revokeObjectURL(item.contentUrl);
        } else {
          setItems((current) => current.map((i) => (i.id === item.id ? { ...i, status } : i)));
        }
      });
      cleanupsRef.current.push(cleanup);
    });
  }

  function handleSaveEdit(updated: BatchItem, applyToAll: boolean) {
    setItems((current) =>
      current.map((i) => {
        if (i.id === updated.id) return updated;
        if (applyToAll && i.batchId === updated.batchId) {
          return { ...i, manualOverrides: updated.manualOverrides };
        }
        return i;
      })
    );
    setEditingItemId(null);
  }

  const editingItem = items.find((i) => i.id === editingItemId) ?? null;
  const editingBatch = editingItem ? batches.find((b) => b.id === editingItem.batchId) : null;
  const editingProfile = editingBatch
    ? profiles.find((p) => p.id === editingBatch.profileId)
    : null;

  const awaitingReviewCount = items.filter((i) => i.status === "AWAITING_REVIEW").length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Editor em massa</h1>
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          + Novo lote
        </button>
      </div>
      <p className="text-sm text-muted">
        Importe vídeos em massa: o perfil escolhido já define engine, template, marca d&apos;água e
        legenda automaticamente.
      </p>
      <p className="mb-8 mt-1 text-xs text-muted">
        Ao confirmar um lote, os vídeos são renderizados em fila e seguem para o Google Drive,
        pasta &quot;Vídeos para postar&quot; (a configurar).
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{awaitingReviewCount}</div>
          <div className="text-xs text-muted">aguardando revisão</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{sentToDriveCount}</div>
          <div className="text-xs text-muted">enviados ao Drive</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{batches.length}</div>
          <div className="text-xs text-muted">lotes criados</div>
        </div>
      </div>

      <VideoGrid
        items={items}
        batches={batches}
        profiles={profiles}
        onEdit={(item) => setEditingItemId(item.id)}
        onConfirmBatch={handleConfirmBatch}
      />

      {isBatchModalOpen && (
        <BatchModal
          profiles={profiles}
          onClose={() => setBatchModalOpen(false)}
          onSubmit={handleBatchSubmit}
        />
      )}

      {editingItem && editingBatch && editingProfile && (
        <EditDrawer
          key={editingItem.id}
          item={editingItem}
          profile={editingProfile}
          onClose={() => setEditingItemId(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
