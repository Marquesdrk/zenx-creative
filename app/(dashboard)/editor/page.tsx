"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Folder, Inbox, PlayCircle } from "lucide-react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { SendToDriveModal } from "@/components/editor/send-to-drive-modal";
import { VideoGrid } from "@/components/editor/video-grid";
import { Topbar } from "@/components/shell/topbar";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { createZipBlob, zipArchiveFilename, zipVideoFilename } from "@/lib/editor/client-zip";
import { useProfiles } from "@/lib/editor/profiles-store";
import { useTemplates } from "@/lib/editor/templates-store";
import { analyzeVideoSource } from "@/lib/editor/source-analysis";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import { createDefaultManualOverrides, type Batch, type BatchItem, type Profile } from "@/lib/editor/types";

const MAX_PARALLEL_RENDERS = 3;

function generateCaption(filename: string, profile: Profile) {
  if (profile.engine === "UGC") return "Link na bio";
  if (profile.engine === "X_STYLE") {
    return "";
  }
  return `Legenda gerada automaticamente a partir de ${filename}`;
}

async function responseErrorMessage(res: Response, fallback: string) {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (contentType.includes("application/json")) {
    try {
      return (JSON.parse(text) as { error?: string }).error ?? fallback;
    } catch {
      return fallback;
    }
  }
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    return `${fallback} A Vercel recusou a requisição antes do render.`;
  }
  return text || fallback;
}

async function mapWithConcurrency<T, R>(
  entries: T[],
  limit: number,
  mapper: (entry: T) => Promise<R>
) {
  const results = new Array<R>(entries.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < entries.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(entries[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// O profile pode trazer avatarUrl/backgroundImageUrl/watermarkImageUrl/reactionMedia como
// data: URLs (imagem salva inline no perfil) — não precisam de nenhuma ponte via Blob, o
// pipeline de render já decodifica data: URLs direto no servidor (materializeMediaUrl em
// lib/server/render.ts), então o profile vai como está no payload de cada requisição.

const IS_VERCEL = Boolean(process.env.NEXT_PUBLIC_IS_VERCEL);

/** Envia o vídeo original + o profile pra rota de export/drive. Na Vercel, o vídeo precisa
 *  passar por um Blob temporário primeiro (contorna o limite de ~4.5MB de payload das
 *  functions); localmente não existe esse limite, então o arquivo vai direto no corpo da
 *  requisição, sem Blob. */
async function sendExportRequest(params: {
  batchId: string;
  profile: Profile;
  response: "video" | "drive";
  socialAccountId?: string;
  item: BatchItem;
  file: File;
}) {
  const { batchId, profile, response, socialAccountId, item, file } = params;

  if (IS_VERCEL) {
    const blob = await upload(`editor-batches/${batchId}/${crypto.randomUUID()}-${file.name}`, file, {
      access: "private",
      handleUploadUrl: "/api/blob/upload",
      multipart: true,
      contentType: file.type || "video/mp4",
    });
    return fetch("/api/batches/export-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId,
        profile,
        response,
        socialAccountId,
        items: [{ ...item, blobUrl: blob.url, blobDownloadUrl: blob.downloadUrl, blobPathname: blob.pathname }],
      }),
    });
  }

  const formData = new FormData();
  formData.set("payload", JSON.stringify({ batchId, profile, response, socialAccountId, items: [item] }));
  formData.set(`file:${item.id}`, file, file.name);
  return fetch("/api/batches/export-local", { method: "POST", body: formData });
}

export default function EditorPage() {
  const [profiles] = useProfiles();
  const [templates] = useTemplates();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null);
  const [exportProgressLabel, setExportProgressLabel] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sendToDriveBatchId, setSendToDriveBatchId] = useState<string | null>(null);
  const [sendingToDriveBatchId, setSendingToDriveBatchId] = useState<string | null>(null);
  const [sendToDriveProgressLabel, setSendToDriveProgressLabel] = useState<string | null>(null);
  const [sendToDriveError, setSendToDriveError] = useState<string | null>(null);
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
          ? { ...item.manualOverrides, crop: analysis.suggestedCrop }
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

    setExportingBatchId(batchId);
    setExportProgressLabel(`Exportando 0/${batchItems.length}`);
    setPageError(null);
    try {
      // Um item por vez (concorrência limitada): na Vercel isso também evita ter dezenas de
      // vídeos originais parados no Blob ao mesmo tempo (cada um some assim que a própria
      // renderização termina, já dentro de export-local); localmente nem passa pelo Blob.
      let rendered = 0;
      const zipFiles = await mapWithConcurrency(
        batchItems.map((item, index) => ({ item, index })),
        MAX_PARALLEL_RENDERS,
        async ({ item, index }) => {
          const file = fileRefs.current.get(item.id);
          if (!file) throw new Error(`Arquivo original ausente: ${item.filename}`);

          const res = await sendExportRequest({ batchId, profile, response: "video", item, file });
          if (!res.ok) {
            const message = await responseErrorMessage(res, `Falha ao exportar "${item.filename}" (${res.status}).`);
            throw new Error(message);
          }

          const content = new Uint8Array(await res.arrayBuffer());
          rendered += 1;
          setExportProgressLabel(`Exportando ${rendered}/${batchItems.length}`);
          return {
            filename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
            content,
          };
        }
      );

      setExportProgressLabel("Gerando ZIP");
      const zipBlob = createZipBlob(zipFiles);
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = zipArchiveFilename(`lote-${batchId}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      batchItems.forEach(removeLocalItemFiles);
      setBatches((current) => current.filter((candidate) => candidate.id !== batchId));
      setItems((current) => current.filter((item) => item.batchId !== batchId));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Falha ao exportar o lote.");
    } finally {
      setExportingBatchId(null);
      setExportProgressLabel(null);
    }
  }

  /** Sobe cada vídeo direto pro Drive, um de cada vez (baixa concorrência de propósito):
   *  /api/batches/export-local já renderiza E sobe pro Drive dentro da mesma function
   *  (response: "drive"), sem devolver os bytes pro navegador. */
  async function handleSendBatchToDrive(batchId: string, socialAccountId: string) {
    const batch = batches.find((candidate) => candidate.id === batchId);
    const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
    const batchItems = items.filter((item) => item.batchId === batchId);
    if (!batch || !profile || batchItems.length === 0) return;

    const missingFiles = batchItems.filter((item) => !fileRefs.current.has(item.id));
    if (missingFiles.length > 0) {
      setSendToDriveError("Um ou mais arquivos originais não estão mais disponíveis. Crie um novo lote sem recarregar a página.");
      return;
    }

    setSendingToDriveBatchId(batchId);
    setSendToDriveProgressLabel(`Enviando 0/${batchItems.length}`);
    setSendToDriveError(null);
    try {
      let sent = 0;
      await mapWithConcurrency(batchItems, MAX_PARALLEL_RENDERS, async (item) => {
        const file = fileRefs.current.get(item.id);
        if (!file) throw new Error(`Arquivo original ausente: ${item.filename}`);

        const res = await sendExportRequest({ batchId, profile, response: "drive", socialAccountId, item, file });
        if (!res.ok) {
          const message = await responseErrorMessage(res, `Falha ao enviar "${item.filename}" para o Google Drive (${res.status}).`);
          throw new Error(message);
        }
        sent += 1;
        setSendToDriveProgressLabel(`Enviando ${sent}/${batchItems.length}`);
      });

      batchItems.forEach(removeLocalItemFiles);
      setBatches((current) => current.filter((candidate) => candidate.id !== batchId));
      setItems((current) => current.filter((item) => item.batchId !== batchId));
      setSendToDriveBatchId(null);
    } catch (error) {
      setSendToDriveError(error instanceof Error ? error.message : "Falha ao enviar o lote para o Google Drive.");
    } finally {
      setSendingToDriveBatchId(null);
      setSendToDriveProgressLabel(null);
    }
  }

  function handleSaveEdit(updated: BatchItem, applyToAll: boolean) {
    setItems((current) =>
      current.map((item) => {
        if (item.id === updated.id) return updated;
        if (applyToAll && item.batchId === updated.batchId) {
          return { ...item, manualOverrides: updated.manualOverrides };
        }
        return item;
      })
    );
    // Avança pro próximo vídeo do mesmo lote em vez de fechar — sem isso, revisar um lote de
    // N vídeos exigia reabrir "Abrir lote" (que só alcança o primeiro item) N vezes.
    const siblings = items.filter((i) => i.batchId === updated.batchId);
    const currentIndex = siblings.findIndex((i) => i.id === updated.id);
    const next = siblings[currentIndex + 1];
    setEditingItemId(next ? next.id : null);
  }

  const editingItem = items.find((i) => i.id === editingItemId) ?? null;
  const editingBatch = editingItem ? batches.find((b) => b.id === editingItem.batchId) : null;
  const editingProfile = editingBatch
    ? profiles.find((p) => p.id === editingBatch.profileId)
    : null;
  const editingBatchItems = editingItem ? items.filter((i) => i.batchId === editingItem.batchId) : [];
  const editingIndex = editingItem ? editingBatchItems.findIndex((i) => i.id === editingItem.id) : -1;
  const editingPositionLabel =
    editingBatchItems.length > 1 ? `${editingIndex + 1} de ${editingBatchItems.length}` : undefined;

  const completedItems = items.filter((i) => i.status === "COMPLETED");
  const awaitingReviewCount = items.filter((i) => i.status === "AWAITING_REVIEW").length;
  const processingCount = items.filter((i) => i.status === "PROCESSING" || i.status === "ANALYZING").length;

  return (
    <div>
      <Topbar
        searchPlaceholder="Buscar vídeos..."
        action={
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(79,70,255,0.28)]"
        >
          + Novo lote
        </button>
        }
      />
      <PageHeader
        title="Editor em massa"
        description="Edite, personalize e prepare vários vídeos em lote com templates, legendas e IA."
      />
      {pageError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {pageError}
        </div>
      )}

      <div className="mb-6 mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Inbox} value={awaitingReviewCount} label="Aguardando revisão" />
        <StatCard icon={PlayCircle} value={processingCount} label="Renderizando" tone="blue" />
        <StatCard icon={CheckCircle2} value={completedItems.length} label="Concluídos" tone="green" />
        <StatCard icon={CalendarDays} value={0} label="Agendados" tone="amber" />
        <StatCard icon={Folder} value={batches.length} label="Lotes criados" />
      </div>

      <VideoGrid
        items={items}
        batches={batches}
        profiles={profiles}
        onEdit={(item) => setEditingItemId(item.id)}
        onDeleteItem={handleDeleteItem}
        onConfirmBatch={handleConfirmBatch}
        onExportBatch={handleExportBatch}
        onSendToDrive={(batchId) => {
          setSendToDriveError(null);
          setSendToDriveBatchId(batchId);
        }}
        exportingBatchId={exportingBatchId}
        exportProgressLabel={exportProgressLabel}
      />

      {sendToDriveBatchId && (
        <SendToDriveModal
          onClose={() => setSendToDriveBatchId(null)}
          onConfirm={(socialAccountId) => handleSendBatchToDrive(sendToDriveBatchId, socialAccountId)}
          sending={sendingToDriveBatchId === sendToDriveBatchId}
          progressLabel={sendToDriveProgressLabel}
          error={sendToDriveError}
        />
      )}

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
          positionLabel={editingPositionLabel}
          onPrev={editingIndex > 0 ? () => setEditingItemId(editingBatchItems[editingIndex - 1].id) : undefined}
          onNext={
            editingIndex >= 0 && editingIndex < editingBatchItems.length - 1
              ? () => setEditingItemId(editingBatchItems[editingIndex + 1].id)
              : undefined
          }
        />
      )}
    </div>
  );
}
