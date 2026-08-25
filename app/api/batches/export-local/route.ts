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

type ExportPayload = {
  batchId: string;
  profile: Profile;
  items: Array<BatchItem & { blobUrl?: string; blobDownloadUrl?: string; blobPathname?: string }>;
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

export async function POST(request: Request) {
  const temporaryUrls: string[] = [];
  const blobUrlsToDelete: string[] = [];
  const zipFiles: Array<{ filename: string; content: Buffer }> = [];

  try {
    const { payload, formData } = await parseRequest(request);

    for (const [index, item] of payload.items.entries()) {
      let contentUrl: string;

      if (item.blobUrl) {
        contentUrl = await persistBlobFile(item);
        blobUrlsToDelete.push(item.blobUrl);
      } else {
        const file = formData?.get(`file:${item.id}`);
        if (!(file instanceof File)) {
          return NextResponse.json({ error: `Arquivo original ausente: ${item.filename}` }, { status: 400 });
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
      zipFiles.push({
        filename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
        content: await readFile(publicUrlToPath(outcome.renderedUrl)),
      });
    }

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
