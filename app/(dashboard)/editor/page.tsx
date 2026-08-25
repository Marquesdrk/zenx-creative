"use client";

import { useEffect, useRef, useState } from "react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { VideoGrid } from "@/components/editor/video-grid";
import { useProfiles } from "@/lib/editor/profiles-store";
import { useTemplates } from "@/lib/editor/templates-store";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import { createDefaultManualOverrides, type Batch, type BatchItem, type Profile } from "@/lib/editor/types";

function generateCaption(filename: string, profile: Profile) {
  if (profile.engine === "UGC") return "Link na bio";
  if (profile.engine === "X_STYLE") {
    return "";
  }
  return `Legenda gerada automaticamente a partir de ${filename}`;
}

export default function EditorPage() {
  const [profiles] = useProfiles();
  const [templates] = useTemplates();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const fileRefs = useRef(new Map<string, File>());
  const objectUrlRefs = useRef(new Set<string>());

  useEffect(() => {
    const objectUrls = objectUrlRefs.current;
    const files = fileRefs.current;
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
      files.clear();
    };
  }, []);

  function removeLocalItemFiles(item: BatchItem) {
    if (item.contentUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.contentUrl);
      objectUrlRefs.current.delete(item.contentUrl);
    }
    fileRefs.current.delete(item.id);
  }

  async function handleBatchSubmit(params: { profileId: string; files: BatchSourceFile[] }) {
    const profile = profiles.find((p) => p.id === params.profileId);
    if (!profile) return;
    setPageError(null);

    const template = templates.find((t) => t.id === profile.templateId);
    const watermarkDefaults =
      profile.engine === "UGC" && template?.engine === "UGC"
        ? resolveWatermarkDefaults(template)
        : GLOBAL_WATERMARK_DEFAULTS;

    const batchId = crypto.randomUUID();
    const batch: Batch = {
      id: batchId,
      profileId: profile.id,
      engine: profile.engine,
      createdAt: new Date().toISOString(),
      exportPath: null,
      exportedAt: null,
      storageProvider: "LOCAL",
      storageUrl: null,
    };

    const createdItems: BatchItem[] = params.files.map(({ name, file }, index) => {
      const itemId = crypto.randomUUID();
      const contentUrl = file ? URL.createObjectURL(file) : null;
      if (file) fileRefs.current.set(itemId, file);
      if (contentUrl) objectUrlRefs.current.add(contentUrl);

      return {
        id: itemId,
        batchId,
        filename: name,
        contentUrl,
        renderedUrl: null,
        error: null,
        status: contentUrl ? "ANALYZING" : "AWAITING_REVIEW",
        sourceAnalysis: null,
        manualOverrides: createDefaultManualOverrides({
          title: profile.engine === "X_STYLE" ? profile.defaultTitle : undefined,
          caption: generateCaption(name, profile),
          watermarkPosition: { ...watermarkDefaults },
          reactionMediaId:
            profile.engine === "REACT" && profile.reactionMedia.length > 0
              ? profile.reactionMedia[index % profile.reactionMedia.length].id
              : null,
        }),
      };
    });

    setBatchModalOpen(false);
    setBatches((current) => [...current, batch]);
    setItems((current) => [...createdItems, ...current]);

    createdItems.forEach(async (item) => {
      if (!item.contentUrl) return;
      const analysis = await analyzeVideoSource(item.contentUrl).catch(() => null);
      const patch: Partial<BatchItem> = {
        status: "AWAITING_REVIEW",
        sourceAnalysis: analysis,
        manualOverrides: analysis
          ? { ...item.manualOverrides, cropBox: analysis.suggestedCropBox, cropZoom: analysis.suggestedZoom }
          : item.manualOverrides,
      };
      setItems((current) => current.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    });
  }

  function handleConfirmBatch(batchId: string) {
    setItems((current) =>
      current.map((item) =>
        item.batchId === batchId && item.status === "AWAITING_REVIEW"
          ? { ...item, status: "COMPLETED" }
          : item
      )
    );
  }

  function handleDeleteItem(item: BatchItem) {
    if (!window.confirm(`Remover "${item.filename}" deste lote?`)) return;
    removeLocalItemFiles(item);
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    const remainingInBatch = items.filter((candidate) => candidate.batchId === item.batchId && candidate.id !== item.id);
    if (remainingInBatch.length === 0) setBatches((current) => current.filter((batch) => batch.id !== item.batchId));
  }

  async function handleExportBatch(batchId: string) {
    const batch = batches.find((candidate) => candidate.id === batchId);
    const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
    const batchItems = items.filter((item) => item.batchId === batchId);
    if (!batch || !profile || batchItems.length === 0) return;

    const missingFiles = batchItems.filter((item) => !fileRefs.current.has(item.id));
    if (missingFiles.length > 0) {
      setPageError("Um ou mais arquivos originais não estão mais disponíveis. Crie um novo lote e exporte sem recarregar a página.");
      return;
    }

    const formData = new FormData();
    formData.append("payload", JSON.stringify({ batchId, profile, items: batchItems }));
    for (const item of batchItems) {
      const file = fileRefs.current.get(item.id);
      if (file) formData.append(`file:${item.id}`, file, item.filename);
    }

    setExportingBatchId(batchId);
    setPageError(null);
    const res = await fetch("/api/batches/export-local", { method: "POST", body: formData });
    setExportingBatchId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setPageError(data?.error ?? "Falha ao exportar o lote.");
      return;
    }
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `lote-${batchId}.zip`;
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    batchItems.forEach(removeLocalItemFiles);
    setBatches((current) => current.filter((candidate) => candidate.id !== batchId));
    setItems((current) => current.filter((item) => item.batchId !== batchId));
  }

  function handleSaveEdit(updated: BatchItem, applyToAll: boolean) {
    setEditingItemId(null);
    setItems((current) =>
      current.map((item) => {
        if (item.id === updated.id) return updated;
        if (applyToAll && item.batchId === updated.batchId) {
          return { ...item, manualOverrides: updated.manualOverrides };
        }
        return item;
      })
    );
  }

  const editingItem = items.find((i) => i.id === editingItemId) ?? null;
  const editingBatch = editingItem ? batches.find((b) => b.id === editingItem.batchId) : null;
  const editingProfile = editingBatch
    ? profiles.find((p) => p.id === editingBatch.profileId)
    : null;

  const completedItems = items.filter((i) => i.status === "COMPLETED");
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
        O lote fica apenas nesta sessão do navegador durante a edição. Ao exportar, a Vercel
        renderiza os vídeos, baixa um ZIP e remove o lote do editor.
      </p>
      {pageError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {pageError}
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{awaitingReviewCount}</div>
          <div className="text-xs text-muted">aguardando revisão</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{completedItems.length}</div>
          <div className="text-xs text-muted">renderizados</div>
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
        onDeleteItem={handleDeleteItem}
        onConfirmBatch={handleConfirmBatch}
        onExportBatch={handleExportBatch}
        exportingBatchId={exportingBatchId}
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
