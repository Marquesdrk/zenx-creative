import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { downloadVideos } from "@/lib/server/video-downloader";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let workDir: string | null = null;
  try {
    const body = (await request.json()) as { sourceUrl?: unknown; urls?: unknown };
    if (typeof body.sourceUrl !== "string" || !Array.isArray(body.urls) || body.urls.some((url) => typeof url !== "string")) {
      return Response.json({ error: "Informe o perfil e pelo menos um vídeo selecionado." }, { status: 400 });
    }
    workDir = await mkdtemp(path.join(tmpdir(), "zenx-video-download-"));
    await downloadVideos(body.sourceUrl, body.urls as string[], workDir);
    const files = (await readdir(workDir)).filter((file) => /\.(mp4|mkv|webm|mov)$/i.test(file));
    if (files.length === 0) throw new Error("Nenhum arquivo foi baixado. O perfil pode exigir login ou estar indisponível.");

    const zipStream = new PassThrough();
    const archive = new ZipArchive({ zlib: { level: 0 } });
    const cleanup = () => { if (workDir) void rm(workDir, { recursive: true, force: true }); };
    archive.on("error", cleanup);
    zipStream.on("close", cleanup);
    archive.pipe(zipStream);
    for (const file of files) archive.file(path.join(workDir, file), { name: file });
    void archive.finalize();
    const platform = body.urls.length && String(body.urls[0]).includes("tiktok") ? "tiktok" : "instagram";
    return new Response(Readable.toWeb(zipStream) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="zenx-${platform}-videos.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível baixar os vídeos." }, { status: 400 });
  }
}
