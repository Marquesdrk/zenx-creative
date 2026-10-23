import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ALLOWED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

export type DownloadPlatform = "INSTAGRAM" | "TIKTOK";

export type DiscoveredVideo = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  viewCount: number | null;
  duration: number | null;
  uploadDate: string | null;
  platform: DownloadPlatform;
};

export function parseSupportedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Cole uma URL válida do Instagram ou TikTok.");
  }

  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error("A URL precisa pertencer ao Instagram ou ao TikTok.");
  }

  const platform: DownloadPlatform = hostname.includes("instagram") ? "INSTAGRAM" : "TIKTOK";
  return { url: url.toString(), platform };
}

export function ytDlpBinary() {
  return process.env.YT_DLP_PATH?.trim() || "yt-dlp";
}

function ytDlpAuthArgs() {
  const cookieFile = process.env.YT_DLP_COOKIES?.trim();
  if (cookieFile) return ["--cookies", cookieFile];
  const browser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ["--cookies-from-browser", browser];
  return [];
}

function extractorError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/not recognized|enoent|cannot find the file/i.test(message)) {
    return "O yt-dlp não está instalado ou não foi encontrado no PATH. Instale-o e tente novamente.";
  }
  if (/instagram:user|unable to extract data|login required|rate-limit reached/i.test(message)) {
    return "O Instagram bloqueou a consulta deste perfil para o yt-dlp. Exporte os cookies da sua sessão do Instagram para um arquivo cookies.txt e configure YT_DLP_COOKIES com o caminho desse arquivo, depois reinicie o servidor.";
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Não foi possível consultar esse perfil.";
}

function normalizeEntry(entry: Record<string, unknown>, platform: DownloadPlatform, index: number): DiscoveredVideo | null {
  const url = typeof entry.webpage_url === "string"
    ? entry.webpage_url
    : typeof entry.original_url === "string"
      ? entry.original_url
      : typeof entry.url === "string" && entry.url.startsWith("http")
        ? entry.url
        : null;
  if (!url) return null;
  const thumbnails = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const firstThumbnail = thumbnails.find((thumbnail): thumbnail is Record<string, unknown> => Boolean(thumbnail && typeof thumbnail === "object"));
  const thumbnailUrl = typeof entry.thumbnail === "string"
    ? entry.thumbnail
    : firstThumbnail && typeof firstThumbnail.url === "string"
      ? firstThumbnail.url
      : null;
  return {
    id: typeof entry.id === "string" ? entry.id : `${platform.toLowerCase()}-${index}`,
    title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : `Vídeo ${index + 1}`,
    url,
    thumbnail: thumbnailUrl,
    viewCount: typeof entry.view_count === "number" ? entry.view_count : null,
    duration: typeof entry.duration === "number" ? entry.duration : null,
    uploadDate: typeof entry.upload_date === "string" ? entry.upload_date : null,
    platform,
  };
}

export async function inspectProfile(value: string, limit = 50) {
  const parsed = parseSupportedUrl(value);
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 50, 1), 100);
  try {
    const { stdout } = await execFileAsync(ytDlpBinary(), [
      ...ytDlpAuthArgs(),
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--skip-download",
      "--ignore-errors",
      "--playlist-end",
      String(safeLimit),
      parsed.url,
    ], { maxBuffer: 25 * 1024 * 1024, windowsHide: true });
    const payload = JSON.parse(stdout) as Record<string, unknown>;
    const rawEntries = Array.isArray(payload.entries) ? payload.entries : [payload];
    const videos = rawEntries
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map((entry, index) => normalizeEntry(entry, parsed.platform, index))
      .filter((entry): entry is DiscoveredVideo => Boolean(entry));
    return { platform: parsed.platform, sourceUrl: parsed.url, videos };
  } catch (error) {
    throw new Error(extractorError(error));
  }
}

export async function downloadVideos(value: string, urls: string[], outputDir: string) {
  const parsed = parseSupportedUrl(value);
  if (urls.length === 0 || urls.length > 100) throw new Error("Selecione entre 1 e 100 vídeos.");
  const parsedUrls = urls.map((item) => parseSupportedUrl(item));
  if (parsedUrls.some((item) => item.platform !== parsed.platform)) {
    throw new Error("Os vídeos selecionados precisam pertencer à mesma plataforma do perfil.");
  }

  try {
    await execFileAsync(ytDlpBinary(), [
      ...ytDlpAuthArgs(),
      "--no-warnings",
      "--no-playlist",
      "--restrict-filenames",
      "--format",
      "bestvideo*+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "--output",
      `${outputDir}/%(title).120B-%(id)s.%(ext)s`,
      ...urls,
    ], { maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  } catch (error) {
    throw new Error(extractorError(error));
  }
  return parsed.platform;
}
