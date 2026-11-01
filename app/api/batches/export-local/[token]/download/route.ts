import { Readable, type Readable as NodeReadable } from "node:stream";
import { createReadStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { generatedFolder } from "@/lib/server/public-files";
import { createZipStream, type ZipDiskFile } from "@/lib/server/zip";

export const runtime = "nodejs";

type ExportManifest = {
  archiveFilename?: string;
  filename: string;
  files?: Array<{ id: string; filename: string }>;
  renderedIds: string[];
};

export async function GET(_request: Request, context: RouteContext<"/api/batches/export-local/[token]/download">) {
  const { token } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Arquivo não encontrado.", { status: 404 });

  const manifestPath = path.join(generatedFolder("batch-space"), `${token}.json`);
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ExportManifest;
  } catch {
    return new Response("Arquivo não encontrado ou já baixado.", { status: 404 });
  }

  if (
    (manifest.archiveFilename &&
      (path.basename(manifest.archiveFilename) !== manifest.archiveFilename ||
        !manifest.archiveFilename.startsWith(`${token}-`))) ||
    path.basename(manifest.filename) !== manifest.filename ||
    !manifest.filename.endsWith(".zip") ||
    !Array.isArray(manifest.renderedIds) ||
    manifest.renderedIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)) ||
    (manifest.files &&
      (manifest.files.some(
        (file) =>
          !file ||
          typeof file.id !== "string" ||
          !/^[a-zA-Z0-9_-]+$/.test(file.id) ||
          typeof file.filename !== "string"
      ) ||
        manifest.files.length !== manifest.renderedIds.length ||
        manifest.files.some((file) => !manifest.renderedIds.includes(file.id))))
  ) {
    return new Response("Manifesto de exportação inválido.", { status: 400 });
  }

  const archivePath = manifest.archiveFilename
    ? path.join(generatedFolder("renders"), manifest.archiveFilename)
    : null;
  const files: ZipDiskFile[] = (manifest.files ?? []).map((file) => ({
    filename: file.filename,
    path: path.join(generatedFolder("renders"), `${file.id}.mp4`),
  }));
  const stream: NodeReadable = archivePath
    ? createReadStream(archivePath)
    : createZipStream(files);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void Promise.all([
      ...(archivePath ? [rm(archivePath, { force: true })] : []),
      rm(manifestPath, { force: true }),
      ...manifest.renderedIds.map((id) => rm(path.join(generatedFolder("renders"), `${id}.mp4`), { force: true })),
    ]).catch(() => undefined);
  };
  stream.once("close", cleanup);
  stream.once("error", cleanup);

  const contentDisposition = `attachment; filename="${manifest.filename.replace(/["\\\r\n]/g, "-")}"`;
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "no-store",
    },
  });
}
