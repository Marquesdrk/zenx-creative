import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo, profilesRepo } from "@/lib/server/db";
import { renderBatchItem } from "@/lib/server/render";
import { uploadRenderToDrive } from "@/lib/server/google-drive";
import path from "node:path";

async function processItem(itemId: string, profileId: string) {
  const item = batchItemsRepo.get(itemId);
  const profile = profilesRepo.list().find((p) => p.id === profileId);
  if (!item || !profile) return;

  const outcome = await renderBatchItem(item, profile);
  if ("error" in outcome) {
    batchItemsRepo.update(itemId, { status: "FAILED", error: outcome.error });
    return;
  }

  batchItemsRepo.update(itemId, { status: "COMPLETED", renderedUrl: outcome.renderedUrl, error: null });

  try {
    const filePath = path.join(process.cwd(), "public", outcome.renderedUrl.replace(/^\//, ""));
    await uploadRenderToDrive(filePath, `${item.filename.replace(/\.[^.]+$/, "")}.mp4`);
  } catch {
    // Upload ao Drive é best-effort: o vídeo já está renderizado e servido localmente em
    // /renders/ independentemente do resultado do envio.
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;
  const batch = batchesRepo.list().find((b) => b.id === batchId);
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  const pendingItems = batchItemsRepo.list().filter((i) => i.batchId === batchId && i.status === "AWAITING_REVIEW");
  for (const item of pendingItems) {
    batchItemsRepo.update(item.id, { status: "PROCESSING" });
  }

  // Renderização roda em segundo plano — a resposta não espera o ffmpeg terminar. O
  // cliente acompanha o progresso fazendo polling em GET /api/batches.
  for (const item of pendingItems) {
    void processItem(item.id, batch.profileId);
  }

  return NextResponse.json({ items: batchItemsRepo.list().filter((i) => i.batchId === batchId) });
}
