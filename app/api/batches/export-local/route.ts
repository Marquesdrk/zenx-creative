import { NextResponse } from "next/server";
import { del, get } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BatchItem, Profile } from "@/lib/editor/types";
import { renderBatchItem } from "@/lib/server/render";
import { deletePublicUrl, generatedFileUrl, generatedFolder, publicUrlToPath, sanitizeFilename } from "@/lib/server/public-files";
import { createZip, zipArchiveFilename, zipVideoFilename } from "@/lib/server/zip";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_PARALLEL_RENDERS = 2;

type ExportPayload = {
  batchId: string;
  profile: Profile;
  items: Array<BatchItem & { blobUrl?: string; blobDownloadUrl?: string; blobPathname?: string }>;
  response?: "zip" | "video";
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

    if (responseMode === "video" && payload.items.length !== 1) {
      return NextResponse.json({ error: "A exportação individual aceita apenas um vídeo por chamada." }, { status: 400 });
    }

    async function renderItem(item: ExportPayload["items"][number], index: number) {
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

      temporaryUrls.push(outcome.renderedUrl);
      const renderedContent = await readFile(publicUrlToPath(outcome.renderedUrl));

      return {
        videoFilename: zipVideoFilename(item.filename),
        zipFilename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
        content: renderedContent,
      };
    }

    if (responseMode === "video") {
      const rendered = await renderItem(payload.items[0], 0);
      return new NextResponse(rendered.content, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${rendered.videoFilename}"`,
        },
      });
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
