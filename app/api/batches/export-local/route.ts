import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BatchItem, Profile } from "@/lib/editor/types";
import { renderBatchItem } from "@/lib/server/render";
import { deletePublicUrl, generatedFileUrl, generatedFolder, publicUrlToPath, sanitizeFilename } from "@/lib/server/public-files";
import { createZip, writeZipArchive, zipArchiveFilename, zipVideoFilename } from "@/lib/server/zip";
import { socialAccountsRepo } from "@/lib/server/meta/db";
import { uploadScheduledVideoToDrive } from "@/lib/server/google-drive";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_PARALLEL_RENDERS = 1;

type ExportPayload = {
  batchId: string;
  profile: Profile;
  items: Array<BatchItem & { blobUrl?: string; blobDownloadUrl?: string; blobPathname?: string }>;
  response?: "zip" | "video" | "drive" | "stage" | "zip-staged" | "discard-staged";
  /** Obrigatório quando response = "drive" — define a pasta de destino no Drive. */
  socialAccountId?: string;
};

function isPayload(value: unknown): value is ExportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ExportPayload>;
  return Boolean(payload.batchId && payload.profile && Array.isArray(payload.items));
}

async function persistUploadedFile(file: File, itemId: string) {
  const uploadDir = generatedFolder("uploads");
  await mkdir(uploadDir, { recursive: true });
  const storedFilename = `${itemId}-${sanitizeFilename(file.name || "video.mp4")}`;
  const storedPath = path.join(uploadDir, storedFilename);
  await writeFile(storedPath, Buffer.from(await file.arrayBuffer()));
  return generatedFileUrl("uploads", storedFilename);
}

async function persistBlobFile(item: ExportPayload["items"][number]) {
  if (!item.blobUrl) {
    throw new Error(`Blob temporário ausente: ${item.filename}`);
  }

  const blob = await get(item.blobUrl, { access: "private", useCache: false });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new Error(`Não foi possível baixar o arquivo temporário: ${item.filename}`);
  }

  const uploadDir = generatedFolder("uploads");
  await mkdir(uploadDir, { recursive: true });
  const storedFilename = `${item.id}-${sanitizeFilename(item.filename || "video.mp4")}`;
  const storedPath = path.join(uploadDir, storedFilename);
  await writeFile(storedPath, Buffer.from(await new Response(blob.stream).arrayBuffer()));
  return generatedFileUrl("uploads", storedFilename);
}

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = (await request.json()) as unknown;
    if (!isPayload(parsed)) throw new Error("Payload do lote inválido.");
    return { payload: parsed, formData: null };
  }

  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    throw new Error("Payload do lote ausente.");
  }

  const parsed = JSON.parse(rawPayload) as unknown;
  if (!isPayload(parsed)) throw new Error("Payload do lote inválido.");
  return { payload: parsed, formData };
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

export async function POST(request: Request) {
  const temporaryUrls: string[] = [];
  const blobUrlsToDelete: string[] = [];

  try {
    const { payload, formData } = await parseRequest(request);
    const responseMode = payload.response ?? "zip";

    if (responseMode === "discard-staged") {
      if (process.env.VERCEL) {
        return NextResponse.json({ error: "A limpeza em etapas está disponível apenas no modo local." }, { status: 400 });
      }
      const ids = payload.items.map((item) => item.id);
      if (ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) {
        return NextResponse.json({ error: "Identificador de vídeo inválido." }, { status: 400 });
      }
      await Promise.all(ids.map((id) => rm(path.join(generatedFolder("renders"), `${id}.mp4`), { force: true })));
      return NextResponse.json({ discarded: true });
    }

    if ((responseMode === "video" || responseMode === "drive") && payload.items.length !== 1) {
      return NextResponse.json({ error: "A exportação individual aceita apenas um vídeo por chamada." }, { status: 400 });
    }
    if (responseMode === "drive" && !payload.socialAccountId) {
      return NextResponse.json({ error: "Informe a conta de destino no Drive." }, { status: 400 });
    }

    async function renderItem(item: ExportPayload["items"][number], index: number, keepRendered: true): Promise<{ videoFilename: string; zipFilename: string; renderedUrl: string }>;
    async function renderItem(item: ExportPayload["items"][number], index: number, keepRendered?: false): Promise<{ videoFilename: string; zipFilename: string; content: Buffer }>;
    async function renderItem(
      item: ExportPayload["items"][number],
      index: number,
      keepRendered = false
    ): Promise<{ videoFilename: string; zipFilename: string; renderedUrl: string } | { videoFilename: string; zipFilename: string; content: Buffer }> {
      let contentUrl: string;

      if (item.blobUrl) {
        contentUrl = await persistBlobFile(item);
        blobUrlsToDelete.push(item.blobUrl);
      } else {
        const file = formData?.get(`file:${item.id}`);
        if (!(file instanceof File)) {
          throw new Error(`Arquivo original ausente: ${item.filename}`);
        }
        contentUrl = await persistUploadedFile(file, item.id);
      }

      temporaryUrls.push(contentUrl);

      const renderItem: BatchItem = {
        ...item,
        contentUrl,
        renderedUrl: null,
        status: "PROCESSING",
        error: null,
      };
      const outcome = await renderBatchItem(renderItem, payload.profile);
      if ("error" in outcome) {
        throw new Error(`${item.filename}: ${outcome.error}`);
      }

      if (keepRendered) {
        return {
          videoFilename: zipVideoFilename(item.filename),
          zipFilename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
          renderedUrl: outcome.renderedUrl,
        };
      }

      temporaryUrls.push(outcome.renderedUrl);
      const renderedContent = await readFile(publicUrlToPath(outcome.renderedUrl));

      return {
        videoFilename: zipVideoFilename(item.filename),
        zipFilename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
        content: renderedContent,
      };
    }

    if (responseMode === "stage") {
      if (process.env.VERCEL) {
        return NextResponse.json({ error: "A exportação em etapas está disponível apenas no modo local." }, { status: 400 });
      }
      if (payload.items.length !== 1) {
        return NextResponse.json({ error: "A preparação aceita um vídeo por chamada." }, { status: 400 });
      }
      const staged = await renderItem(payload.items[0], 0, true);
      return NextResponse.json({ staged: true, filename: staged.videoFilename });
    }

    if (responseMode === "zip-staged") {
      if (process.env.VERCEL) {
        return NextResponse.json({ error: "A montagem em etapas está disponível apenas no modo local." }, { status: 400 });
      }
      if (payload.items.length === 0 || payload.items.length > 0xffff) {
        return NextResponse.json({ error: "O lote não contém uma quantidade válida de vídeos." }, { status: 400 });
      }

      const files = payload.items.map((item, index) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(item.id)) throw new Error("Identificador de vídeo inválido.");
        return {
          filename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
          path: path.join(generatedFolder("renders"), `${item.id}.mp4`),
        };
      });
      const token = randomUUID();
      const archiveFilename = `${token}-${zipArchiveFilename(`lote-${payload.batchId}`)}`;
      const downloadFilename = zipArchiveFilename(`lote-${payload.batchId}`);
      const archivePath = path.join(generatedFolder("renders"), archiveFilename);
      const manifestPath = path.join(generatedFolder("batch-space"), `${token}.json`);
      try {
        await writeZipArchive(files, archivePath);
        await mkdir(path.dirname(manifestPath), { recursive: true });
        await writeFile(manifestPath, JSON.stringify({ archiveFilename, filename: downloadFilename, renderedIds: payload.items.map((item) => item.id) }));
      } catch (error) {
        await rm(archivePath, { force: true });
        throw error;
      }

      return NextResponse.json({
        downloadUrl: `/api/batches/export-local/${token}/download`,
        filename: downloadFilename,
      });
    }

    if (responseMode === "video") {
      // Devolve como resposta HTTP em streaming em vez de um buffer fechado — um vídeo
      // renderizado facilmente passa dos 4.5MB de limite de payload das functions "normais" da
      // Vercel (rejeitado na camada de plataforma, antes do nosso código rodar); streaming não
      // tem esse teto. (Tentamos um blob temporário antes, mas esse projeto usa um Blob store
      // privado, que não aceita access "public" nem permite baixar sem o token pela downloadUrl.)
      const rendered = await renderItem(payload.items[0], 0);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(rendered.content);
          controller.close();
        },
      });
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${rendered.videoFilename}"`,
        },
      });
    }

    if (responseMode === "drive") {
      // Sobe direto pro Drive aqui dentro da mesma function, sem devolver os bytes pro
      // navegador — evita o hop extra por Vercel Blob que estourava a cota de 1GB do Hobby em
      // lotes com vídeos grandes (o vídeo original ainda passa pelo Blob até aqui, mas some
      // assim que renderItem termina, via blobUrlsToDelete no finally abaixo).
      const account = await socialAccountsRepo.get(payload.socialAccountId!);
      if (!account) {
        return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
      }
      const rendered = await renderItem(payload.items[0], 0);
      const result = await uploadScheduledVideoToDrive(
        rendered.content,
        rendered.videoFilename,
        "video/mp4",
        account.username || account.accountName
      );
      return NextResponse.json({ driveFileId: result.fileId, driveFileName: result.fileName });
    }

    const renderedItems = await mapWithConcurrency(
      payload.items.map((item, index) => ({ item, index })),
      MAX_PARALLEL_RENDERS,
      ({ item, index }) => renderItem(item, index)
    );
    const zipFiles = renderedItems.map((item) => ({ filename: item.zipFilename, content: item.content }));

    return new NextResponse(createZip(zipFiles), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipArchiveFilename(`lote-${payload.batchId}`)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao renderizar o lote." },
      { status: 500 }
    );
  } finally {
    await Promise.all([
      ...temporaryUrls.map((url) => deletePublicUrl(url)),
      ...blobUrlsToDelete.map((url) => del(url).catch(() => {})),
    ]);
  }
}
