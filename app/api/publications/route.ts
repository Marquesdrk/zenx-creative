import { NextResponse } from "next/server";
import { batchItemsRepo, publicationsRepo } from "@/lib/server/db";
import { publishPublication } from "@/lib/server/publishing-runner";
import type { Platform, Publication } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(publicationsRepo.list());
}

export async function POST(request: Request) {
  const { batchItemId, platform, scheduledAt } = (await request.json()) as {
    batchItemId: string;
    platform: Platform;
    scheduledAt?: string | null;
  };
  const item = batchItemsRepo.get(batchItemId);
  if (!item || !item.renderedUrl) {
    return NextResponse.json({ error: "Item não encontrado ou ainda não renderizado." }, { status: 400 });
  }

  const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
  const publication: Publication = {
    id: crypto.randomUUID(),
    batchItemId,
    platform,
    status: "PENDING",
    scheduledAt: scheduledIso,
    externalId: null,
    permalink: null,
    error: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };
  publicationsRepo.create(publication);

  if (!scheduledIso || scheduledIso <= new Date().toISOString()) {
    await publishPublication(publication.id);
  }

  return NextResponse.json(publicationsRepo.list().find((p) => p.id === publication.id));
}
