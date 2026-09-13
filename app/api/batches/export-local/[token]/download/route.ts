import { createReadStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { generatedFolder } from "@/lib/server/public-files";

export const runtime = "nodejs";

type ExportManifest = { archiveFilename: string; filename: string; renderedIds: string[] };

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
    path.basename(manifest.archiveFilename) !== manifest.archiveFilename ||
    !manifest.archiveFilename.startsWith(`${token}-`) ||
    !Array.isArray(manifest.renderedIds) ||
    manifest.renderedIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id))
  ) {
    return new Response("Manifesto de exportação inválido.", { status: 400 });
  }

  const archivePath = path.join(generatedFolder("renders"), manifest.archiveFilename);
  const stream = createReadStream(archivePath);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    void Promise.all([
      rm(archivePath, { force: true }),
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
