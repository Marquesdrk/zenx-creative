import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import { deletePublicUrl, publicUrlToPath } from "@/lib/server/public-files";
import { createZip, zipArchiveFilename, zipVideoFilename } from "@/lib/server/zip";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = batchesRepo.list().find((candidate) => candidate.id === id);
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  const batchItems = batchItemsRepo.list().filter((item) => item.batchId === id);
  const completedItems = batchItems.filter((item) => item.status === "COMPLETED" && item.renderedUrl);
  if (completedItems.length === 0) {
    return NextResponse.json({ error: "Renderize ao menos um vídeo antes de exportar o lote." }, { status: 400 });
  }
  if (completedItems.length !== batchItems.length) {
    return NextResponse.json({ error: "Confirme e aguarde todos os vídeos do lote renderizarem antes de exportar." }, { status: 400 });
  }

  const files = await Promise.all(
    completedItems.map(async (item, index) => ({
      filename: zipVideoFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
      content: await readFile(publicUrlToPath(item.renderedUrl!)),
    }))
  );
  const zip = createZip(files);

  await Promise.all(batchItems.flatMap((item) => [deletePublicUrl(item.contentUrl), deletePublicUrl(item.renderedUrl)]));
  for (const item of batchItems) {
    batchItemsRepo.remove(item.id);
  }
  batchesRepo.remove(id);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipArchiveFilename(`lote-${id}`)}"`,
      "X-Removed-Batch-Id": id,
    },
  });
}
