import path from "node:path";
import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import { batchSpaceFolder, copyPublicUrlToFolder, sanitizeFilename } from "@/lib/server/public-files";
import { isSupabaseStorageConfigured, uploadPublicFileToSupabase } from "@/lib/server/supabase-storage";

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

  const folder = batchSpaceFolder(id);
  const copied = await Promise.all(
    completedItems.map((item, index) =>
      copyPublicUrlToFolder(item.renderedUrl!, folder, `${String(index + 1).padStart(2, "0")}-${item.filename}`)
    )
  );

  let storageProvider: "LOCAL" | "SUPABASE" = "LOCAL";
  let storageUrl: string | null = `/batch-space/${id}`;
  const uploads: Array<{ localUrl: string; supabaseUrl?: string; objectPath?: string }> = copied.map((file) => ({
    localUrl: file.url,
  }));

  if (isSupabaseStorageConfigured()) {
    storageProvider = "SUPABASE";
    await Promise.all(
      copied.map(async (file, index) => {
        const objectPath = `lotes/${id}/${sanitizeFilename(path.basename(file.path))}`;
        const uploaded = await uploadPublicFileToSupabase(file.path, objectPath);
        uploads[index] = { ...uploads[index], supabaseUrl: uploaded.publicUrl, objectPath: uploaded.objectPath };
      })
    );
    storageUrl = uploads[0]?.supabaseUrl ? uploads[0].supabaseUrl.replace(/\/[^/]+$/, "") : null;
  }

  batchesRepo.update(id, {
    exportPath: `/batch-space/${id}`,
    exportedAt: new Date().toISOString(),
    storageProvider,
    storageUrl,
  });

  return NextResponse.json({
    batch: batchesRepo.list().find((candidate) => candidate.id === id),
    files: uploads,
  });
}
