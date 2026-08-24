import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";

function sanitizeDownloadFilename(name: string) {
  const ext = ".mp4";
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "video"}${ext}`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = batchesRepo.list().find((candidate) => candidate.id === id);
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  const completedItems = batchItemsRepo
    .list()
    .filter((item) => item.batchId === id && item.status === "COMPLETED" && item.renderedUrl);
  if (completedItems.length === 0) {
    return NextResponse.json({ error: "Renderize ao menos um vídeo antes de exportar o lote." }, { status: 400 });
  }

  const files = completedItems.map((item, index) => ({
    url: item.renderedUrl!,
    filename: sanitizeDownloadFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
  }));

  return NextResponse.json({
    batch: batchesRepo.list().find((candidate) => candidate.id === id),
    files,
  });
}
