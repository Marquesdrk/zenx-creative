import path from "node:path";
import { batchItemsRepo, publicationsRepo } from "@/lib/server/db";
import { ADAPTERS } from "@/lib/server/publishing";

export async function publishPublication(publicationId: string) {
  const publication = publicationsRepo.get(publicationId);
  if (!publication) throw new Error("Publicação não encontrada.");

  const item = batchItemsRepo.get(publication.batchItemId);
  if (!item?.renderedUrl) {
    publicationsRepo.update(publication.id, { status: "FAILED", error: "Vídeo ainda não renderizado." });
    return publicationsRepo.get(publication.id);
  }

  const adapter = ADAPTERS[publication.platform];
  if (!adapter.isConfigured()) {
    publicationsRepo.update(publication.id, {
      status: "FAILED",
      error: `${adapter.name} não configurado. Veja .env.local.example.`,
    });
    return publicationsRepo.get(publication.id);
  }

  try {
    const videoPath = path.join(process.cwd(), "public", item.renderedUrl.replace(/^\//, ""));
    const videoPublicUrl = `${process.env.PUBLIC_BASE_URL ?? ""}${item.renderedUrl}`;
    const result = await adapter.publish({
      videoPath,
      videoPublicUrl,
      caption: item.manualOverrides.caption || item.manualOverrides.title || "",
    });
    publicationsRepo.update(publication.id, {
      status: "PUBLISHED",
      externalId: result.externalId,
      permalink: result.permalink,
      error: null,
      publishedAt: new Date().toISOString(),
    });
  } catch (err) {
    publicationsRepo.update(publication.id, {
      status: "FAILED",
      error: err instanceof Error ? err.message : "Erro desconhecido",
    });
  }

  return publicationsRepo.get(publication.id);
}
