import { NextResponse } from "next/server";
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
  items: BatchItem[];
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawPayload = formData.get("payload");
  if (typeof rawPayload !== "string") {
    return NextResponse.json({ error: "Payload do lote ausente." }, { status: 400 });
  }

  const parsed = JSON.parse(rawPayload) as unknown;
  if (!isPayload(parsed)) {
    return NextResponse.json({ error: "Payload do lote inválido." }, { status: 400 });
  }

  const temporaryUrls: string[] = [];
  const zipFiles: Array<{ filename: string; content: Buffer }> = [];

  try {
    for (const [index, item] of parsed.items.entries()) {
      const file = formData.get(`file:${item.id}`);
      if (!(file instanceof File)) {
        return NextResponse.json({ error: `Arquivo original ausente: ${item.filename}` }, { status: 400 });
      }

      const contentUrl = await persistUploadedFile(file, item.id);
      temporaryUrls.push(contentUrl);

      const renderItem: BatchItem = {
        ...item,
        contentUrl,
        renderedUrl: null,
        status: "PROCESSING",
        error: null,
      };
      const outcome = await renderBatchItem(renderItem, parsed.profile);
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
        "Content-Disposition": `attachment; filename="${zipArchiveFilename(`lote-${parsed.batchId}`)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao renderizar o lote." },
      { status: 500 }
    );
  } finally {
    await Promise.all(temporaryUrls.map((url) => deletePublicUrl(url)));
  }
}
