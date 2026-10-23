import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { generatedFileUrl, generatedFolder } from "@/lib/server/public-files";
import { isSupabaseStorageConfigured, uploadPublicBufferToSupabase } from "@/lib/server/supabase-storage";

const UPLOAD_DIR = generatedFolder("uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Campo 'file' ausente ou inválido." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "O arquivo selecionado está vazio." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "A imagem precisa ter no máximo 10 MB." }, { status: 413 });
    }

    const extension = IMAGE_TYPES[file.type.toLowerCase()];
    if (!extension) {
      return NextResponse.json(
        { error: "Formato não suportado. Envie uma imagem JPG, PNG ou WebP." },
        { status: 415 }
      );
    }

    const filename = `${crypto.randomUUID()}${extension}`;

    // Profile assets are referenced by profiles persisted in Supabase. Store them in shared
    // storage even when the upload starts from localhost; returning a production URL for a file
    // written only to this machine makes the preview (and later renders) 404.
    if (process.env.VERCEL || isSupabaseStorageConfigured()) {
      const result = await uploadPublicBufferToSupabase(
        Buffer.from(await file.arrayBuffer()),
        `uploads/${filename}`,
        file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type
      );
      return NextResponse.json({ url: result.publicUrl, filename: file.name });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), bytes);

    return NextResponse.json({ url: generatedFileUrl("uploads", filename), filename: file.name });
  } catch (error) {
    console.error("[upload] Falha ao salvar imagem", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a imagem. Tente novamente." },
      { status: 500 }
    );
  }
}
