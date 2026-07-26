import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import type { Batch, BatchItem, Engine, ManualOverrides, SourceAnalysis } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json({ batches: batchesRepo.list(), items: batchItemsRepo.list() });
}

type CreateBatchBody = {
  profileId: string;
  engine: Engine;
  items: Array<{
    filename: string;
    contentUrl: string | null;
    status: "ANALYZING" | "AWAITING_REVIEW";
    manualOverrides: ManualOverrides;
    sourceAnalysis?: SourceAnalysis | null;
  }>;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateBatchBody;

  const batch: Batch = {
    id: crypto.randomUUID(),
    profileId: body.profileId,
    engine: body.engine,
    createdAt: new Date().toISOString(),
  };
  batchesRepo.create(batch);

  const items: BatchItem[] = body.items.map((input) => {
    const item: BatchItem = {
      id: crypto.randomUUID(),
      batchId: batch.id,
      filename: input.filename,
      status: input.status,
      contentUrl: input.contentUrl,
      renderedUrl: null,
      error: null,
      manualOverrides: input.manualOverrides,
      sourceAnalysis: input.sourceAnalysis ?? null,
    };
    batchItemsRepo.create(item);
    return item;
  });

  return NextResponse.json({ batch, items });
}
