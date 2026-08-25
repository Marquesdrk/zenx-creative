import path from "node:path";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const PUBLIC_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public");
const GENERATED_DIR = process.env.VERCEL ? path.join("/tmp", "zenx-files") : PUBLIC_DIR;
const GENERATED_KINDS = new Set(["uploads", "renders", "batch-space"]);

export function generatedFolder(kind: "uploads" | "renders" | "batch-space") {
  return path.join(GENERATED_DIR, kind);
}

export function generatedFileUrl(kind: "uploads" | "renders" | "batch-space", filename: string) {
  return process.env.VERCEL ? `/api/files/${kind}/${filename}` : `/${kind}/${filename}`;
}

export function publicUrlToPath(url: string) {
  const clean = url.split("?")[0]?.replace(/^\//, "") ?? "";
  const parts = clean.split("/");
  if (parts[0] === "api" && parts[1] === "files" && GENERATED_KINDS.has(parts[2] ?? "")) {
    return path.join(GENERATED_DIR, ...parts.slice(2));
  }
  return path.join(PUBLIC_DIR, clean);
}

export function publicPathToUrl(filePath: string) {
  const relative = path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/");
  return `/${relative}`;
}

export function sanitizeFilename(name: string) {
  const ext = path.extname(name) || ".mp4";
  const base = path.basename(name, ext).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "video"}${ext.toLowerCase()}`;
}

export async function deletePublicUrl(url: string | null | undefined) {
  if (!url || !url.startsWith("/")) return;
  const filePath = publicUrlToPath(url);
  const canDeletePublicGenerated =
    filePath.startsWith(path.join(PUBLIC_DIR, "uploads") + path.sep) ||
    filePath.startsWith(path.join(PUBLIC_DIR, "renders") + path.sep) ||
    filePath.startsWith(path.join(PUBLIC_DIR, "batch-space") + path.sep);
  const canDeleteTmpGenerated = filePath.startsWith(GENERATED_DIR + path.sep);
  if ((!canDeletePublicGenerated && !canDeleteTmpGenerated) || !existsSync(filePath)) return;
  await rm(filePath, { force: true });
}

export async function copyPublicUrlToFolder(url: string, destinationFolder: string, filename: string) {
  const sourcePath = publicUrlToPath(url);
  if (!sourcePath.startsWith(PUBLIC_DIR) || !existsSync(sourcePath)) {
    throw new Error("Arquivo renderizado não encontrado no servidor.");
  }

  await mkdir(destinationFolder, { recursive: true });
  const destinationPath = path.join(destinationFolder, sanitizeFilename(filename));
  if (!destinationPath.startsWith(destinationFolder)) {
    throw new Error("Nome de arquivo inválido.");
  }
  await copyFile(sourcePath, destinationPath);
  return { path: destinationPath, url: publicPathToUrl(destinationPath) };
}

export function batchSpaceFolder(batchId: string) {
  return path.join(generatedFolder("batch-space"), batchId);
}
