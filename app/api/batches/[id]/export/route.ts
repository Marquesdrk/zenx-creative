import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo, scheduledPostsRepo } from "@/lib/server/db";
import { deletePublicUrl } from "@/lib/server/public-files";
import type { ScheduledPost } from "@/lib/server/meta/types";

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

  const now = new Date().toISOString();
  const posts: ScheduledPost[] = completedItems.map((item, index) => ({
    id: crypto.randomUUID(),
    userId: null,
    videoUrl: item.renderedUrl!,
    caption: item.manualOverrides.caption,
    scheduledAt: null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  }));

  for (const post of posts) {
    scheduledPostsRepo.create(post);
  }

  await Promise.all(completedItems.map((item) => deletePublicUrl(item.contentUrl)));

  for (const item of batchItemsRepo.list().filter((candidate) => candidate.batchId === id)) {
    batchItemsRepo.remove(item.id);
  }
  batchesRepo.remove(id);

  return NextResponse.json({
    movedToPublishing: posts.map((post, index) => ({
      post,
      filename: sanitizeDownloadFilename(`${String(index + 1).padStart(2, "0")}-${completedItems[index].filename}`),
    })),
    removedBatchId: id,
  });
}
