import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { generatedFolder } from "@/lib/server/public-files";

const ALLOWED_KINDS = new Set(["uploads", "renders"]);

function contentTypeFor(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; filename: string }> }) {
  const { kind, filename } = await params;
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "Tipo de arquivo inválido." }, { status: 404 });
  }

  const folder = generatedFolder(kind as "uploads" | "renders");
  const filePath = path.join(folder, path.basename(filename));
  if (!filePath.startsWith(folder + path.sep) || !existsSync(filePath)) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }

  const content = await readFile(filePath);
  return new NextResponse(content, {
    headers: {
      "Content-Type": contentTypeFor(filename),
      "Cache-Control": "no-store",
    },
  });
}
