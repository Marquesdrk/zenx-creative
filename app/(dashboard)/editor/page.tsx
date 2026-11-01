"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { CalendarDays, CheckCircle2, Folder, Inbox, PlayCircle } from "lucide-react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { useBatchDrafts } from "@/components/editor/batch-drafts-provider";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { SendToDriveModal } from "@/components/editor/send-to-drive-modal";
import { VideoGrid } from "@/components/editor/video-grid";
import { Topbar } from "@/components/shell/topbar";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { createZipBlob, zipArchiveFilename, zipVideoFilename } from "@/lib/editor/client-zip";
import { useProfiles } from "@/lib/editor/profiles-store";
import { useTemplates } from "@/lib/editor/templates-store";
import { analyzeVideoSource, readVideoDimensions } from "@/lib/editor/source-analysis";
import { applySharedOverrides, type SharedOverrideKey } from "@/lib/editor/shared-overrides";
import { extractVideoTitle } from "@/lib/editor/title-ocr";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import {
  createDefaultManualOverrides,
  FULL_FRAME_CROP,
  SOURCE_ANALYSIS_VERSION,
  type Batch,
  type BatchItem,
  type Crop,
  type Profile,
} from "@/lib/editor/types";

function sameCropValues(a: Crop, b: Crop) {
  return (["x", "y", "width", "height"] as const).every((key) => Math.abs(a[key] - b[key]) < 0.0005);
}

// Local browser runtimes can underreport hardwareConcurrency (for example, 4 on a 12-thread
// workstation), which would serialize a GPU-backed batch. Keep three local encodes active;
// serverless exports remain conservative to avoid exhausting function resources.
const IS_VERCEL = Boolean(process.env.NEXT_PUBLIC_IS_VERCEL);
const MAX_PARALLEL_RENDERS = IS_VERCEL ? 1 : 3;
type PendingExportPart = { downloadUrl: string; filename: string };
type PendingExportParts = {
  batchId: string;
  downloads: PendingExportPart[];
  readyItemIds: string[];
  failures: Array<{ filename: string; message: string }>;
  clicked: number[];
};

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
  const explain = (message: string) => {
    if (/4294967268|ENOSPC|no space left on device|disk full/i.test(message)) {
      return "O disco ficou sem espaço durante a conversão. Libere espaço no computador e tente novamente, ou use Enviar ao Drive para processar um vídeo por vez.";
    }
    return message;
  };
  if (contentType.includes("application/json")) {
    try {
      return explain((JSON.parse(text) as { error?: string }).error ?? fallback);
    } catch {
      return fallback;
    }
  }
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    const requestId = res.headers.get("x-vercel-id") ?? res.headers.get("x-request-id");
    const requestHint = requestId ? ` Identificador da requisição: ${requestId}.` : "";
    return `${fallback} O servidor retornou uma página de erro (HTTP ${res.status}); a resposta não informa se a falha ocorreu antes ou durante o render.${requestHint}`;
  }
  return explain(text || fallback);
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.ceil(bytes / 1024 ** 2)} MB`;
}

async function mapWithConcurrency<T, R>(
  entries: T[],
  limit: number,
  mapper: (entry: T) => Promise<R>
) {
  const results = new Array<R>(entries.length);
  let nextIndex = 0;
  let failure: unknown;

  async function worker() {
    while (nextIndex < entries.length && failure === undefined) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = await mapper(entries[currentIndex]);
      } catch (error) {
        failure = error;
      }
    }
  }

  const workerCount = Math.min(limit, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failure !== undefined) throw failure;
  return results;
}

// Os assets do perfil podem ser URLs do armazenamento do app ou do proxy do Google Drive. O
// pipeline de render materializa ambos no servidor antes de chamar o ffmpeg.

/** Envia o vídeo original + o profile pra rota de export/drive. Na Vercel, o vídeo precisa
 *  passar por um Blob temporário primeiro (contorna o limite de ~4.5MB de payload das
 *  functions); localmente não existe esse limite, então o arquivo vai direto no corpo da
 *  requisição, sem Blob. */
async function sendExportRequest(params: {
  batchId: string;
  profile: Profile;
  response: "video" | "drive" | "stage";
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
  const { batches, setBatches, items, setItems, fileRefs, objectUrlRefs } = useBatchDrafts();
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null);
  const [exportProgressLabel, setExportProgressLabel] = useState<string | null>(null);
  const [stagedItemsByBatch, setStagedItemsByBatch] = useState<Record<string, string[]>>({});
  const [pendingExportParts, setPendingExportParts] = useState<PendingExportParts | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sendToDriveBatchId, setSendToDriveBatchId] = useState<string | null>(null);
  const [sendingToDriveBatchId, setSendingToDriveBatchId] = useState<string | null>(null);
  const [sendToDriveProgressLabel, setSendToDriveProgressLabel] = useState<string | null>(null);
  const [sendToDriveError, setSendToDriveError] = useState<string | null>(null);
  function removeLocalItemFiles(item: BatchItem) {
    if (item.contentUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.contentUrl);
      objectUrlRefs.delete(item.contentUrl);
    }
    fileRefs.delete(item.id);
  }

  function handleDownloadExportPart(index: number) {
    const pending = pendingExportParts;
    const part = pending?.downloads[index];
    if (!pending || !part || pending.clicked.includes(index)) return;

    const link = document.createElement("a");
    link.href = part.downloadUrl;
    link.download = part.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    const clicked = [...pending.clicked, index];
    if (clicked.length < pending.downloads.length) {
      setPendingExportParts({ ...pending, clicked });
      return;
    }

    const readyIds = new Set(pending.readyItemIds);
    items.filter((item) => readyIds.has(item.id)).forEach(removeLocalItemFiles);
    setItems((current) => current.filter((item) => !readyIds.has(item.id)));
    setStagedItemsByBatch((current) => {
      const remaining = (current[pending.batchId] ?? []).filter((id) => !readyIds.has(id));
      if (remaining.length === 0) {
        const next = { ...current };
        delete next[pending.batchId];
        return next;
      }
      return { ...current, [pending.batchId]: remaining };
    });

    if (pending.failures.length === 0) {
      setBatches((current) => current.filter((batch) => batch.id !== pending.batchId));
    } else {
      const examples = pending.failures
        .slice(0, 3)
        .map(({ filename, message }) => `• ${filename}: ${message}`)
        .join("\n");
      setPageError(
        `As ${pending.downloads.length} partes do ZIP foram baixadas. ${pending.failures.length} vídeo(s) permaneceram no lote para nova tentativa.\n${examples}${pending.failures.length > 3 ? `\n… e mais ${pending.failures.length - 3} falha(s).` : ""}`
      );
    }
    setPendingExportParts(null);
  }

  async function handleBatchSubmit(params: { profileId: string; files: BatchSourceFile[]; smartCrop: boolean }) {
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
      if (file) fileRefs.set(itemId, file);
      if (contentUrl) objectUrlRefs.add(contentUrl);

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
          aspectMode: profile.engine === "REACT" ? "free" : undefined,
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

    void runSmartCropAnalysis(
      createdItems.filter((item) => item.contentUrl),
      params.smartCrop ? "full" : "dimensions"
    );
  }

  /** Recorte inteligente automático de cada vídeo (importação e "reanalisar pendentes"). Cada
   *  resultado é aplicado sobre o estado MAIS RECENTE do item — nunca sobre uma cópia antiga —,
   *  senão edições feitas enquanto o lote ainda analisa (texto, título) seriam desfeitas. O
   *  recorte só é trocado quando o usuário ainda não mexeu nele. */
  async function runSmartCropAnalysis(targets: BatchItem[], mode: "full" | "dimensions" = "full") {
    const ids = new Set(targets.map((item) => item.id));
    setItems((current) =>
      current.map((item) => (ids.has(item.id) && item.status !== "PROCESSING" ? { ...item, status: "ANALYZING" } : item))
    );
    await mapWithConcurrency(targets, mode === "full" ? 6 : 12, async (item) => {
      if (!item.contentUrl) return;
      const analysis = await (mode === "full" ? analyzeVideoSource(item.contentUrl) : readVideoDimensions(item.contentUrl)).catch(
        () => null
      );
      setItems((current) =>
        current.map((candidate) => {
          if (candidate.id !== item.id) return candidate;
          const previousSuggestion = candidate.sourceAnalysis?.suggestedCrop ?? FULL_FRAME_CROP;
          const cropUntouched =
            sameCropValues(candidate.manualOverrides.crop, FULL_FRAME_CROP) ||
            sameCropValues(candidate.manualOverrides.crop, previousSuggestion);
          return {
            ...candidate,
            status: candidate.status === "ANALYZING" ? "AWAITING_REVIEW" : candidate.status,
            sourceAnalysis: analysis ?? candidate.sourceAnalysis,
            manualOverrides:
              analysis && !analysis.incomplete && cropUntouched
                ? { ...candidate.manualOverrides, crop: analysis.suggestedCrop }
                : candidate.manualOverrides,
          };
        })
      );
    });
  }

  function handleReanalyzeBatch(batchId: string) {
    const pending = items.filter(
      (item) =>
        item.batchId === batchId &&
        item.contentUrl &&
        item.status !== "COMPLETED" &&
        item.status !== "PROCESSING" &&
        (!item.sourceAnalysis || item.sourceAnalysis.incomplete || (item.sourceAnalysis.analysisVersion ?? 0) < SOURCE_ANALYSIS_VERSION)
    );
    void runSmartCropAnalysis(pending);
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
    const stagedIds = stagedItemsByBatch[item.batchId] ?? [];
    const batch = batches.find((candidate) => candidate.id === item.batchId);
    const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
    if (stagedIds.includes(item.id) && profile) {
      void fetch("/api/batches/export-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: item.batchId,
          profile,
          response: "discard-staged",
          items: [{ id: item.id, filename: item.filename }],
        }),
      }).catch(() => undefined);
      setStagedItemsByBatch((current) => ({
        ...current,
        [item.batchId]: (current[item.batchId] ?? []).filter((id) => id !== item.id),
      }));
    }
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

    const missingFiles = batchItems.filter((item) => !fileRefs.has(item.id));
    if (missingFiles.length > 0) {
      setPageError("Um ou mais arquivos originais não estão mais disponíveis. Crie um novo lote e exporte sem recarregar a página.");
      return;
    }

    if (!IS_VERCEL) {
      try {
        const diskResponse = await fetch("/api/batches/disk-space", { cache: "no-store" });
        if (!diskResponse.ok) throw new Error("Não foi possível verificar o espaço livre antes de exportar.");
        const { freeBytes } = (await diskResponse.json()) as { freeBytes: number };
        const inputBytes = batchItems.reduce((total, item) => total + (fileRefs.get(item.id)?.size ?? 0), 0);
        const estimatedBytes = Math.ceil(inputBytes * 2 + 512 * 1024 ** 2);
        if (freeBytes < estimatedBytes) {
          setPageError(
            `Espaço insuficiente para exportar o lote: há ${formatBytes(freeBytes)} livres e a estimativa é ${formatBytes(estimatedBytes)} (vídeos renderizados + ZIP, com reserva). Libere espaço ou use “Enviar ao Drive” para processar um vídeo por vez.`
          );
          return;
        }
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Não foi possível verificar o espaço livre antes de exportar.");
        return;
      }
    }

    setExportingBatchId(batchId);
    const stagedItemIds = [...(stagedItemsByBatch[batchId] ?? [])];
    setExportProgressLabel(`Exportando ${stagedItemIds.length}/${batchItems.length}`);
    setPageError(null);
    try {
      if (IS_VERCEL) {
        // As functions Vercel são efêmeras; nelas, mantém o fluxo com Blob e arquivo
        // ZIP montado no cliente. No desktop local, a variante abaixo trabalha em disco.
        let rendered = 0;
        const zipFiles: Array<{ filename: string; content: Uint8Array }> = [];
        const successfulIds = new Set<string>();
        const failures: Array<{ filename: string; message: string }> = [];

        // Preserve os resultados bons se um vídeo falhar no servidor. Assim, um único
        // 500 não descarta o ZIP inteiro nem força a renderização repetida dos anteriores.
        for (const [index, item] of batchItems.entries()) {
          try {
            const file = fileRefs.get(item.id);
            if (!file) throw new Error(`Arquivo original ausente: ${item.filename}`);

            const res = await sendExportRequest({ batchId, profile, response: "video", item, file });
            if (!res.ok) {
              const message = await responseErrorMessage(res, `Falha ao exportar "${item.filename}" (${res.status}).`);
              throw new Error(message);
            }

            const content = new Uint8Array(await res.arrayBuffer());
            zipFiles.push({
              filename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
              content,
            });
            successfulIds.add(item.id);
            rendered += 1;
          } catch (error) {
            failures.push({
              filename: item.filename,
              message: error instanceof Error ? error.message : "Falha desconhecida ao exportar este vídeo.",
            });
          }
          setExportProgressLabel(`Exportados ${rendered}/${batchItems.length} · falhas ${failures.length}`);
        }

        if (zipFiles.length === 0) {
          throw new Error(failures[0]?.message ?? "Nenhum vídeo pôde ser exportado.");
        }

        setExportProgressLabel("Gerando ZIP");
        const zipBlob = createZipBlob(zipFiles);
        const downloadUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = zipArchiveFilename(
          failures.length > 0 ? `lote-${batchId}-parcial` : `lote-${batchId}`
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);

        if (failures.length > 0) {
          batchItems.filter((item) => successfulIds.has(item.id)).forEach(removeLocalItemFiles);
          setItems((current) => current.filter((item) => !successfulIds.has(item.id)));
          const examples = failures.slice(0, 3).map(({ filename, message }) => `• ${filename}: ${message}`).join("\n");
          setPageError(
            `ZIP parcial baixado com ${zipFiles.length} vídeo(s). ${failures.length} vídeo(s) permaneceram no lote para nova tentativa.\n${examples}${failures.length > 3 ? `\n… e mais ${failures.length - 3} falha(s).` : ""}`
          );
          return;
        }
      } else {
        let rendered = stagedItemIds.length;
        const failures: Array<{ filename: string; message: string }> = [];
        // Vários vídeos renderizam ao mesmo tempo: um de cada vez deixava CPU/GPU ociosa entre
        // o upload, o ffprobe e a codificação de cada item (a principal causa da lentidão).
        const pendingItems = batchItems.filter((item) => !stagedItemIds.includes(item.id));
        await mapWithConcurrency(pendingItems, MAX_PARALLEL_RENDERS, async (item) => {
          try {
            const file = fileRefs.get(item.id);
            if (!file) throw new Error(`Arquivo original ausente: ${item.filename}`);

            const res = await sendExportRequest({ batchId, profile, response: "stage", item, file });
            if (!res.ok) {
              const message = await responseErrorMessage(res, `Falha ao exportar "${item.filename}" (${res.status}).`);
              throw new Error(message);
            }

            stagedItemIds.push(item.id);
            rendered += 1;
            setStagedItemsByBatch((current) => ({
              ...current,
              [batchId]: Array.from(new Set([...(current[batchId] ?? []), item.id])),
            }));
          } catch (error) {
            failures.push({
              filename: item.filename,
              message: error instanceof Error ? error.message : "Falha desconhecida ao exportar este vídeo.",
            });
          }
          setExportProgressLabel(`Renderizados ${rendered}/${batchItems.length} · falhas ${failures.length}`);
        });

        const readyItems = batchItems.filter((item) => stagedItemIds.includes(item.id));
        if (readyItems.length === 0) {
          throw new Error(failures[0]?.message ?? "Nenhum vídeo pôde ser exportado.");
        }

        setExportProgressLabel("Montando arquivo para download");
        const zipResponse = await fetch("/api/batches/export-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            profile,
            response: "zip-staged",
            items: readyItems.map(({ id, filename }) => ({ id, filename })),
          }),
        });
        if (!zipResponse.ok) {
          const message = await responseErrorMessage(zipResponse, `Falha ao montar o ZIP (${zipResponse.status}).`);
          throw new Error(message);
        }

        const download = (await zipResponse.json()) as {
          downloadUrl?: string;
          filename?: string;
          downloads?: PendingExportPart[];
        };
        const downloads = download.downloads?.length
          ? download.downloads
          : download.downloadUrl && download.filename
            ? [{ downloadUrl: download.downloadUrl, filename: download.filename }]
            : [];
        if (downloads.length === 0) throw new Error("O servidor não retornou os arquivos ZIP para download.");

        if (downloads.length > 1) {
          setPendingExportParts({
            batchId,
            downloads,
            readyItemIds: readyItems.map((item) => item.id),
            failures,
            clicked: [],
          });
          setPageError(null);
          return;
        }

        const link = document.createElement("a");
        link.href = downloads[0].downloadUrl;
        link.download = failures.length > 0
          ? zipArchiveFilename(`lote-${batchId}-parcial`)
          : downloads[0].filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        const readyIds = new Set(readyItems.map((item) => item.id));
        readyItems.forEach(removeLocalItemFiles);
        setStagedItemsByBatch((current) => {
          const remaining = (current[batchId] ?? []).filter((id) => !readyIds.has(id));
          if (remaining.length === 0) {
            const next = { ...current };
            delete next[batchId];
            return next;
          }
          return { ...current, [batchId]: remaining };
        });
        setItems((current) => current.filter((item) => !readyIds.has(item.id)));

        if (failures.length > 0) {
          const examples = failures.slice(0, 3).map(({ filename, message }) => `• ${filename}: ${message}`).join("\n");
          setPageError(
            `ZIP parcial baixado com ${readyItems.length} vídeo(s). ${failures.length} vídeo(s) permaneceram no lote para nova tentativa.\n${examples}${failures.length > 3 ? `\n… e mais ${failures.length - 3} falha(s).` : ""}`
          );
          return;
        }
      }

      if (IS_VERCEL) {
        batchItems.forEach(removeLocalItemFiles);
        setBatches((current) => current.filter((candidate) => candidate.id !== batchId));
        setItems((current) => current.filter((item) => item.batchId !== batchId));
      } else {
        setBatches((current) => current.filter((candidate) => candidate.id !== batchId));
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Falha ao exportar o lote.";
      const retainedCount = stagedItemIds.length;
      setPageError(
        !IS_VERCEL && retainedCount > 0
          ? `${detail} ${retainedCount}/${batchItems.length} vídeo(s) já renderizado(s) foram mantidos. Clique em Exportar novamente para continuar.`
          : detail
      );
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

    const missingFiles = batchItems.filter((item) => !fileRefs.has(item.id));
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
        const file = fileRefs.get(item.id);
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
    const stagedIds = stagedItemsByBatch[updated.batchId] ?? [];
    const batch = batches.find((candidate) => candidate.id === updated.batchId);
    const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
    if (stagedIds.length > 0 && profile) {
      void fetch("/api/batches/export-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: updated.batchId,
          profile,
          response: "discard-staged",
          items: stagedIds.map((id) => ({ id, filename: "staged.mp4" })),
        }),
      }).catch(() => undefined);
      setStagedItemsByBatch((current) => {
        const next = { ...current };
        delete next[updated.batchId];
        return next;
      });
    }
    setItems((current) =>
      current.map((item) => {
        if (item.id === updated.id) return updated;
        if (applyToAll && item.batchId === updated.batchId) {
          // Só os ajustes do lote — título e recorte continuam sendo de cada vídeo.
          return { ...item, manualOverrides: applySharedOverrides(item.manualOverrides, updated.manualOverrides) };
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

  /** Aplica na hora, sem esperar "Salvar", campos do vídeo aberto aos outros vídeos do lote. */
  function handleApplyToBatch(
    batchId: string,
    sourceItemId: string,
    source: BatchItem["manualOverrides"],
    only: ReadonlyArray<SharedOverrideKey>
  ) {
    setItems((current) =>
      current.map((item) =>
        item.batchId === batchId && item.id !== sourceItemId
          ? { ...item, manualOverrides: applySharedOverrides(item.manualOverrides, source, only) }
          : item
      )
    );
    return items.filter((item) => item.batchId === batchId && item.id !== sourceItemId).length;
  }

  /** Lê o título do vídeo original (texto acima do vídeo) dos outros itens do lote e grava no
   *  campo Título. Só troca quando achou um título — vídeo sem título mantém o que já tinha. */
  async function handleDetectTitlesBatch(
    batchId: string,
    excludeItemId: string,
    onProgress: (done: number, total: number) => void
  ) {
    const targets = items.filter(
      (item) =>
        item.batchId === batchId &&
        item.id !== excludeItemId &&
        item.contentUrl &&
        (item.status === "AWAITING_REVIEW" || item.status === "FAILED")
    );
    let done = 0;
    let found = 0;
    onProgress(0, targets.length);
    await mapWithConcurrency(targets, 2, async (item) => {
      const title = await extractVideoTitle(
        item.contentUrl as string,
        item.manualOverrides.crop,
        item.manualOverrides.rotation
      ).catch(() => null);
      if (title) {
        found += 1;
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id ? { ...candidate, manualOverrides: { ...candidate.manualOverrides, title } } : candidate
          )
        );
      }
      done += 1;
      onProgress(done, targets.length);
    });
    return { found, total: targets.length };
  }

  /** Recorte inteligente em lote: reanalisa os vídeos ainda não renderizados do lote (menos o que
   *  está aberto no editor) e troca o recorte de cada um pelo detectado — cada vídeo recebe o
   *  próprio retângulo, nunca o mesmo para todos. */
  async function handleSmartCropBatch(
    batchId: string,
    excludeItemId: string,
    onProgress: (done: number, total: number) => void
  ) {
    const targets = items.filter(
      (item) =>
        item.batchId === batchId &&
        item.id !== excludeItemId &&
        item.contentUrl &&
        (item.status === "AWAITING_REVIEW" || item.status === "FAILED")
    );
    let done = 0;
    let updated = 0;
    onProgress(0, targets.length);
    await mapWithConcurrency(targets, 4, async (item) => {
      const analysis = await analyzeVideoSource(item.contentUrl as string).catch(() => null);
      if (analysis && !analysis.incomplete) {
        updated += 1;
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  sourceAnalysis: analysis,
                  manualOverrides: { ...candidate.manualOverrides, crop: analysis.suggestedCrop, zoom: 1 },
                }
              : candidate
          )
        );
      }
      done += 1;
      onProgress(done, targets.length);
    });
    return updated;
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
  // Lotes ainda analisando (barra de progresso) ou com vídeos que a análise não conseguiu ler.
  const analysisBanners = batches
    .map((batch) => {
      const analyzable = items.filter((item) => item.batchId === batch.id && item.contentUrl);
      const analyzing = analyzable.filter((item) => item.status === "ANALYZING").length;
      const failed = analyzable.filter(
        (item) =>
          item.status === "AWAITING_REVIEW" &&
          (!item.sourceAnalysis || item.sourceAnalysis.incomplete || (item.sourceAnalysis.analysisVersion ?? 0) < SOURCE_ANALYSIS_VERSION)
      ).length;
      const profile = profiles.find((candidate) => candidate.id === batch.profileId);
      return { batchId: batch.id, name: profile?.name ?? "Lote", total: analyzable.length, analyzing, failed };
    })
    .filter((banner) => banner.analyzing > 0 || banner.failed > 0);

  // "Renderizando" conta só renderizações; vídeos em análise aparecem na barra de recorte inteligente.
  const processingCount = items.filter((i) => i.status === "PROCESSING").length;

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
        <div className="mb-6 whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {pageError}
        </div>
      )}
      {pendingExportParts && (
        <section className="mb-6 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-4 text-sm text-violet-100">
          <p className="mb-3 font-medium">
            O lote foi dividido em {pendingExportParts.downloads.length} arquivos ZIP para respeitar o limite de 4 GB. Baixe cada parte:
          </p>
          <div className="flex flex-wrap gap-2">
            {pendingExportParts.downloads.map((part, index) => {
              const started = pendingExportParts.clicked.includes(index);
              return (
                <button
                  key={part.downloadUrl}
                  type="button"
                  disabled={started}
                  onClick={() => handleDownloadExportPart(index)}
                  className="rounded-md border border-violet-400/30 bg-violet-500/15 px-3 py-2 hover:bg-violet-500/25 disabled:cursor-default disabled:opacity-60"
                >
                  {started ? `Download iniciado · parte ${index + 1}` : `Baixar parte ${index + 1} de ${pendingExportParts.downloads.length}`}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {analysisBanners.map((banner) => (
        <section
          key={banner.batchId}
          className="mt-6 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-gray-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold text-foreground">
              Recorte inteligente — {banner.name}
              <span className="ml-2 font-normal text-muted">
                {banner.analyzing > 0
                  ? `${banner.total - banner.analyzing} de ${banner.total} analisados`
                  : `${banner.failed} vídeo(s) sem recorte confiável`}
              </span>
            </p>
            {banner.analyzing === 0 && banner.failed > 0 && (
              <button
                type="button"
                onClick={() => handleReanalyzeBatch(banner.batchId)}
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-[#B8B0FF] hover:bg-accent/20"
              >
                Reanalisar os {banner.failed} pendentes
              </button>
            )}
          </div>
          {banner.analyzing > 0 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round(((banner.total - banner.analyzing) / banner.total) * 100)}%` }}
              />
            </div>
          )}
        </section>
      ))}

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
          onSmartCropBatch={handleSmartCropBatch}
          onApplyToBatch={handleApplyToBatch}
          onDetectTitlesBatch={handleDetectTitlesBatch}
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
