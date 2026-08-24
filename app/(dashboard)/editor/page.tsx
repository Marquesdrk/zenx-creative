"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { VideoGrid } from "@/components/editor/video-grid";
import { useProfiles } from "@/lib/editor/profiles-store";
import { useTemplates } from "@/lib/editor/templates-store";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { uploadFile } from "@/lib/editor/upload-file";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import { createDefaultManualOverrides, type Batch, type BatchItem, type Profile } from "@/lib/editor/types";

const POLL_MS = 1500;
const ACTIVE_STATUSES = new Set(["IMPORTING", "ANALYZING", "PROCESSING"]);

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/batches");
      if (!res.ok) return;
      const data = (await res.json()) as { batches: Batch[]; items: BatchItem[] };
      setBatches(data.batches);
      setItems(data.items);
    } catch {
      // Sem servidor disponível (ex.: ambiente de teste) — mantém o estado vazio.
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const hasActive = items.some((item) => ACTIVE_STATUSES.has(item.status));
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(refresh, POLL_MS);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [items, refresh]);

  async function handleBatchSubmit(params: { profileId: string; files: BatchSourceFile[] }) {
    const profile = profiles.find((p) => p.id === params.profileId);
    if (!profile) return;
    setBatchModalOpen(false);

    const template = templates.find((t) => t.id === profile.templateId);
    const watermarkDefaults =
      profile.engine === "UGC" && template?.engine === "UGC"
        ? resolveWatermarkDefaults(template)
        : GLOBAL_WATERMARK_DEFAULTS;

    // Envia os arquivos reais ao servidor antes de criar o lote — contentUrl passa a ser
    // uma URL pública persistida (/uploads/...), não um object URL que se perde ao recarregar.
    const uploaded = await Promise.all(
      params.files.map(async ({ name, file }, index) => ({
        filename: name,
        contentUrl: file ? await uploadFile(file) : null,
        reactionMediaId:
          profile.engine === "REACT" && profile.reactionMedia.length > 0
            ? profile.reactionMedia[index % profile.reactionMedia.length].id
            : null,
      }))
    );

    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        engine: profile.engine,
        items: uploaded.map((u) => ({
          filename: u.filename,
          contentUrl: u.contentUrl,
          status: u.contentUrl ? "ANALYZING" : "AWAITING_REVIEW",
          manualOverrides: createDefaultManualOverrides({
            title: profile.engine === "X_STYLE" ? profile.defaultTitle : undefined,
            caption: generateCaption(u.filename, profile),
            watermarkPosition: { ...watermarkDefaults },
            reactionMediaId: u.reactionMediaId,
          }),
        })),
      }),
    });
    const created = (await res.json()) as { batch: Batch; items: BatchItem[] };
    setBatches((current) => [...current, created.batch]);
    setItems((current) => [...created.items, ...current]);

    // Normalização (fase 3) roda no navegador (heurística de barras via canvas) — o
    // resultado é salvo no servidor assim que termina.
    created.items.forEach(async (item) => {
      if (!item.contentUrl) return;
      const analysis = await analyzeVideoSource(item.contentUrl).catch(() => null);
      const patch: Partial<BatchItem> = {
        status: "AWAITING_REVIEW",
        sourceAnalysis: analysis,
        manualOverrides: analysis
          ? { ...item.manualOverrides, cropBox: analysis.suggestedCropBox, cropZoom: analysis.suggestedZoom }
          : item.manualOverrides,
      };
      const patched = await fetch(`/api/batch-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json() as Promise<BatchItem>);
      setItems((current) => current.map((i) => (i.id === patched.id ? patched : i)));
    });
  }

  async function handleConfirmBatch(batchId: string) {
    setItems((current) =>
      current.map((item) =>
        item.batchId === batchId && item.status === "AWAITING_REVIEW"
          ? { ...item, status: "PROCESSING" }
          : item
      )
    );
    await fetch(`/api/batches/${batchId}/confirm`, { method: "POST" });
    refresh();
  }

  async function handleDeleteItem(item: BatchItem) {
    if (!window.confirm(`Remover "${item.filename}" deste lote?`)) return;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    const res = await fetch(`/api/batch-items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      await refresh();
      return;
    }
    const data = (await res.json()) as { removedBatchId: string | null };
    if (data.removedBatchId) {
      setBatches((current) => current.filter((batch) => batch.id !== data.removedBatchId));
    }
  }

  async function handleExportBatch(batchId: string) {
    setExportingBatchId(batchId);
    const res = await fetch(`/api/batches/${batchId}/export`, { method: "POST" });
    setExportingBatchId(null);
    if (!res.ok) return;
    const data = (await res.json()) as { batch?: Batch };
    if (data.batch) {
      setBatches((current) => current.map((batch) => (batch.id === data.batch!.id ? data.batch! : batch)));
    }
  }

  async function handleSaveEdit(updated: BatchItem, applyToAll: boolean) {
    setEditingItemId(null);
    const targets = applyToAll ? items.filter((i) => i.batchId === updated.batchId) : [updated];
    setItems((current) =>
      current.map((item) => {
        if (item.id === updated.id) return updated;
        if (applyToAll && item.batchId === updated.batchId) {
          return { ...item, manualOverrides: updated.manualOverrides };
        }
        return item;
      })
    );
    await Promise.all(
      targets.map((target) =>
        fetch(`/api/batch-items/${target.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            target.id === updated.id ? updated : { manualOverrides: updated.manualOverrides }
          ),
        })
      )
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
        Ao confirmar um lote, os vídeos são renderizados de verdade (ffmpeg) e, se o Google Drive
        estiver conectado, enviados para a pasta &quot;Vídeos para postar&quot;.
      </p>

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
