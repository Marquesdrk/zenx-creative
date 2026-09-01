import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import type { Batch, BatchItem, Engine, ManualOverrides, SourceAnalysis } from "@/lib/editor/types";

export async function GET() {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { batches: [], items: [] },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }
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
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "No deploy, o editor não salva lotes no servidor. Use a exportação local do editor." },
      { status: 410, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  }

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
