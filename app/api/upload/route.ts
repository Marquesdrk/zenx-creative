import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { generatedFileUrl, generatedFolder } from "@/lib/server/public-files";

const UPLOAD_DIR = generatedFolder("uploads");

function extensionFor(file: File): string {
  const fromName = path.extname(file.name);
  if (fromName) return fromName;
  if (file.type.startsWith("video/")) return `.${file.type.split("/")[1] || "mp4"}`;
  if (file.type.startsWith("image/")) return `.${file.type.split("/")[1] || "png"}`;
  return "";
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' ausente ou inválido." }, { status: 400 });
  }

  const filename = `${crypto.randomUUID()}${extensionFor(file)}`;

  if (process.env.VERCEL) {
    const blob = await put(`profile-assets/${filename}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || undefined,
    });
    return NextResponse.json({ url: blob.url, filename: file.name });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);

  return NextResponse.json({ url: generatedFileUrl("uploads", filename), filename: file.name });
}
