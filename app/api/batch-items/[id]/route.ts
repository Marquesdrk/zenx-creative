import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo, publicationsRepo } from "@/lib/server/db";
import { deletePublicUrl } from "@/lib/server/public-files";
import type { BatchItem } from "@/lib/editor/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patch = (await request.json()) as Partial<BatchItem>;
  const existing = batchItemsRepo.get(id);
  if (!existing) {
    return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  }
  batchItemsRepo.update(id, patch);
  return NextResponse.json(batchItemsRepo.get(id));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = batchItemsRepo.get(id);
  if (!existing) {
    return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  }

  publicationsRepo.removeByBatchItem(id);
  batchItemsRepo.remove(id);
  await Promise.all([deletePublicUrl(existing.contentUrl), deletePublicUrl(existing.renderedUrl)]);

  const remaining = batchItemsRepo.list().filter((item) => item.batchId === existing.batchId);
  if (remaining.length === 0) {
    batchesRepo.remove(existing.batchId);
  }

  return NextResponse.json({ ok: true, removedId: id, removedBatchId: remaining.length === 0 ? existing.batchId : null });
}
