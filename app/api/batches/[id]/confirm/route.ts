import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import { editorProfilesRepo } from "@/lib/server/editor-store-db";
import { renderBatchItem } from "@/lib/server/render";

async function processItem(itemId: string, profileId: string) {
  const item = batchItemsRepo.get(itemId);
  const profiles = await editorProfilesRepo.list();
  const profile = profiles.find((p) => p.id === profileId);
  if (!item || !profile) return;

  const outcome = await renderBatchItem(item, profile);
  if ("error" in outcome) {
    batchItemsRepo.update(itemId, { status: "FAILED", error: outcome.error });
    return;
  }

  batchItemsRepo.update(itemId, { status: "COMPLETED", renderedUrl: outcome.renderedUrl, error: null });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "No deploy, lotes do editor são renderizados somente no momento da exportação." },
      { status: 410, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

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
