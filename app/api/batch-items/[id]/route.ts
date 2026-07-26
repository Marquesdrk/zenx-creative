import { NextResponse } from "next/server";
import { batchItemsRepo } from "@/lib/server/db";
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
