import path from "node:path";
import { NextResponse } from "next/server";
import { batchItemsRepo, publicationsRepo } from "@/lib/server/db";
import { ADAPTERS } from "@/lib/server/publishing";
import type { Platform, Publication } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(publicationsRepo.list());
}

export async function POST(request: Request) {
  const { batchItemId, platform } = (await request.json()) as { batchItemId: string; platform: Platform };
  const item = batchItemsRepo.get(batchItemId);
  if (!item || !item.renderedUrl) {
    return NextResponse.json({ error: "Item não encontrado ou ainda não renderizado." }, { status: 400 });
  }

  const adapter = ADAPTERS[platform];
  const publication: Publication = {
    id: crypto.randomUUID(),
    batchItemId,
    platform,
    status: "PENDING",
    externalId: null,
    permalink: null,
    error: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };
  publicationsRepo.create(publication);

  if (!adapter.isConfigured()) {
    publicationsRepo.update(publication.id, {
      status: "FAILED",
      error: `${adapter.name} não configurado. Veja .env.local.example.`,
    });
    return NextResponse.json(publicationsRepo.list().find((p) => p.id === publication.id));
  }

  try {
    const videoPath = path.join(process.cwd(), "public", item.renderedUrl.replace(/^\//, ""));
    const videoPublicUrl = `${process.env.PUBLIC_BASE_URL ?? ""}${item.renderedUrl}`;
    const result = await adapter.publish({ videoPath, videoPublicUrl, caption: item.manualOverrides.caption });
    publicationsRepo.update(publication.id, {
      status: "PUBLISHED",
      externalId: result.externalId,
      permalink: result.permalink,
      publishedAt: new Date().toISOString(),
    });
  } catch (err) {
    publicationsRepo.update(publication.id, {
      status: "FAILED",
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }

  return NextResponse.json(publicationsRepo.list().find((p) => p.id === publication.id));
}
