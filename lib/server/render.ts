import ffmpegStatic from "ffmpeg-static";
// @ts-expect-error -- ffprobe-static ships no type declarations.
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import * as PImage from "pureimage";
import { get } from "@vercel/blob";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { effectiveDimensions, fitCenteredRect, normalizedCropToPixels } from "@/lib/editor/crop-geometry";
import { MOCK_PROFILES } from "@/lib/editor/mock-profiles";
import { resolveXStyleLayout, type BatchItem, type Profile } from "@/lib/editor/types";
import { emojiAssetCode, isEmojiSegment, splitGraphemes, whatsappEmojiFilename } from "@/lib/emoji/whatsapp";
import { generatedFileUrl, generatedFolder, publicUrlToPath, sanitizeFilename } from "@/lib/server/public-files";
import { listFilesInFolder, reactionMediaFolderSegments, streamDriveFile } from "@/lib/server/google-drive";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath((ffprobeStatic as { path: string }).path);

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const RENDER_DIR = generatedFolder("renders");
const ROTATE_FILTERS: Record<number, string[]> = {
  0: [],
  90: ["transpose=1"],
  180: ["hflip", "vflip"],
  270: ["transpose=2"],
};

// O render tem duas passagens (loop da reação + composição final). Limita cada processo
// para a exportação não ocupar todos os núcleos e deixar o restante do computador sem resposta.
const ENCODE_THREADS = Math.max(1, Math.min(2, Math.floor(os.cpus().length * 0.5)));
const PING_PONG_CACHE_DIR = path.join(os.tmpdir(), "zenx-reaction-cache");
const pingPongReactionCache = new Map<string, Promise<string>>();

const FALLBACK_TEXT_FONT_PATH = path.join(process.cwd(), "assets", "fonts", "arialbd.ttf");
const RENDER_FONT_PATHS = {
  impact: "C:\\Windows\\Fonts\\impact.ttf",
  arial: FALLBACK_TEXT_FONT_PATH,
  condensed: "C:\\Windows\\Fonts\\bahnschrift.ttf",
  serif: "C:\\Windows\\Fonts\\georgia.ttf",
  clean: "C:\\Windows\\Fonts\\arial.ttf",
} as const;
const RENDER_FONT_FAMILIES = {
  impact: "ZenxImpact",
  arial: "ZenxSans",
  condensed: "ZenxCondensed",
  serif: "ZenxSerif",
  clean: "ZenxClean",
} as const;
const WHATSAPP_EMOJI_DIR = path.join(process.cwd(), "public", "whatsapp-emoji", "png");
let textFontPromise: Promise<void> | null = null;
const emojiImageCache = new Map<string, Promise<PImage.Bitmap | null>>();

function hexColorToRgba(hex: string) {
  const normalized = hex.replace("#", "");
  const rgb = Number.parseInt(normalized, 16);
  return ((rgb << 8) | 0xff) >>> 0;
}

function drawTornBanner(
  ctx: ReturnType<ReturnType<typeof PImage.make>["getContext"]>,
  y: number,
  height: number,
  inset = 0
) {
  const left = inset;
  const right = OUTPUT_WIDTH - inset;
  const top = y + inset;
  const bottom = y + height - inset;
  ctx.beginPath();
  ctx.moveTo(left, top + 18);
  for (let x = left; x <= right; x += 72) {
    ctx.lineTo(x, top + (Math.round(x / 72) % 2 === 0 ? 0 : 10));
  }
  ctx.lineTo(right, bottom - 18);
  for (let x = right; x >= left; x -= 72) {
    ctx.lineTo(x, bottom - (Math.round(x / 72) % 2 === 0 ? 0 : 10));
  }
  ctx.closePath();
  ctx.fill();
}

function isRemoteUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isDataUrl(url: string) {
  return /^data:[^;]+;base64,/i.test(url);
}

function isVercelBlobUrl(url: string) {
  return /^https?:\/\/[^/]+\.blob\.vercel-storage\.com\//i.test(url);
}

function extensionFromUrl(url: string) {
  const ext = path.extname(new URL(url).pathname);
  return ext || ".bin";
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/webm") return ".webm";
  return ".bin";
}

async function materializeDataUrl(url: string) {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(url);
  if (!match) return null;
  const uploadDir = generatedFolder("uploads");
  await mkdir(uploadDir, { recursive: true });
  const filename = sanitizeFilename(`local-asset-${crypto.randomUUID()}${extensionFromMimeType(match[1])}`);
  const filePath = path.join(uploadDir, filename);
  await writeFile(filePath, Buffer.from(match[2], "base64"));
  return { path: filePath, cleanup: true };
}

async function materializeMediaUrl(url: string) {
  if (isDataUrl(url)) return materializeDataUrl(url);

  const driveMediaMatch = url.match(/^\/api\/drive\/(?:media|stream)\/([^/?#]+)/i);
  if (driveMediaMatch) {
    const driveFile = await streamDriveFile(decodeURIComponent(driveMediaMatch[1]));
    const uploadDir = generatedFolder("uploads");
    await mkdir(uploadDir, { recursive: true });
    const filename = sanitizeFilename(`drive-${crypto.randomUUID()}${extensionFromMimeType(driveFile.mimeType)}`);
    const filePath = path.join(uploadDir, filename);
    const body = await new Response(Readable.toWeb(driveFile.stream) as unknown as ReadableStream).arrayBuffer();
    await writeFile(filePath, Buffer.from(body));
    return { path: filePath, cleanup: true };
  }

  if (!isRemoteUrl(url)) {
    const filePath = publicUrlToPath(url);
    return existsSync(filePath) ? { path: filePath, cleanup: false } : null;
  }

  const blob = isVercelBlobUrl(url) ? await get(url, { access: "private", useCache: false }) : null;
  const stream = blob?.stream ?? null;
  const response = stream ? new Response(stream) : await fetch(url);
  if (!response.ok) return null;
  const uploadDir = generatedFolder("uploads");
  await mkdir(uploadDir, { recursive: true });
  const filename = sanitizeFilename(`remote-${crypto.randomUUID()}${extensionFromUrl(url)}`);
  const filePath = path.join(uploadDir, filename);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return { path: filePath, cleanup: true };
}

async function cleanupMaterializedMedia(media: { path: string; cleanup: boolean } | null) {
  if (media?.cleanup) await rm(media.path, { force: true });
}

function xStyleBackgroundCandidates(profile: Profile) {
  if (profile.engine !== "X_STYLE") return [];
  const candidates = profile.backgroundImageUrl ? [profile.backgroundImageUrl] : [];
  const fallback = MOCK_PROFILES.find(
    (candidate) =>
      candidate.engine === "X_STYLE" &&
      (candidate.id === profile.id || candidate.templateId === profile.templateId)
  );
  if (fallback?.engine === "X_STYLE" && fallback.backgroundImageUrl && !candidates.includes(fallback.backgroundImageUrl)) {
    candidates.push(fallback.backgroundImageUrl);
  }
  return candidates;
}

/** Consulta a resolução real do arquivo via ffprobe — nunca confia só na análise feita no
 *  navegador (que pode falhar silenciosamente para formatos que o <video> do browser não
 *  decodifica, mesmo que o ffmpeg consiga processar normalmente). Usar a dimensão errada
 *  aqui faz o filtro de recorte estourar os limites do frame real e o ffmpeg falhar. */
function probeDimensions(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const stream = data.streams.find((s) => s.width && s.height);
      if (!stream?.width || !stream.height) {
        reject(new Error("Não foi possível determinar a resolução do vídeo de origem."));
        return;
      }
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

/** Filtros universais aplicados ao vídeo de conteúdo de qualquer engine: rotação, recorte
 *  explícito do usuário (editor visual de recorte), e por fim o encaixe no quadro alvo —
 *  "Preencher" aperta o centro do recorte pelo zoom até preencher sem barras, "Ajustar" só
 *  escala e completa com barras, nunca cortando além do que já foi definido em `crop`.
 *  Sempre termina em targetW x targetH. */
function buildContentFilters(
  item: BatchItem,
  source: { width: number; height: number },
  targetWidth: number,
  targetHeight: number
): string[] {
  const { rotation, fit, crop, zoom } = item.manualOverrides;
  const filters = [...(ROTATE_FILTERS[rotation] ?? [])];
  const { width: effWidth, height: effHeight } = effectiveDimensions(source.width, source.height, rotation);

  // Recorte explícito do usuário — única fonte da região usada, igual ao editor visual e à
  // prévia (lib/editor/crop-geometry.ts normalizedCropToPixels).
  const userCrop = normalizedCropToPixels(crop, effWidth, effHeight);
  filters.push(`crop=${userCrop.width}:${userCrop.height}:${userCrop.x}:${userCrop.y}`);

  if (fit === "contain") {
    filters.push(
      `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=fast_bilinear`,
      `pad=${targetWidth}:${targetHeight}:(ow-iw)*0.5:(oh-ih)*0.5:color=black`
    );
  } else {
    const fitted = fitCenteredRect(userCrop.width, userCrop.height, zoom, targetWidth / targetHeight);
    filters.push(
      `crop=${Math.round(fitted.width)}:${Math.round(fitted.height)}:${Math.round(fitted.x)}:${Math.round(fitted.y)}`
    );
    filters.push(`scale=${targetWidth}:${targetHeight}:flags=fast_bilinear`);
  }
  filters.push("fps=30");
  return filters;
}

function run(inputs: Array<{ path: string; options?: string[] }>, filterGraph: string[], outputPath: string, item: BatchItem) {
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg();
    const stderr: string[] = [];
    inputs.forEach(({ path: inputPath, options }) => {
      command.input(inputPath);
      if (options) command.inputOptions(options);
    });

    const outputOptions = ["-map", "[outv]"];
    if (!item.manualOverrides.muted) {
      outputOptions.push("-map", "0:a?", "-af", `volume=${item.manualOverrides.volume}`);
    }
    outputOptions.push(
      "-filter_complex_threads",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "27",
      "-threads",
      String(ENCODE_THREADS),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart"
    );

    command
      .complexFilter(filterGraph)
      .outputOptions(outputOptions)
      .on("stderr", (line) => stderr.push(line))
      .on("error", (err) => {
        const detail = stderr.slice(-8).join(" ").trim();
        console.error("[render] FFmpeg falhou", { outputPath, message: err.message, detail });
        reject(new Error(detail ? `${err.message} — ${detail}` : err.message));
      })
      .on("end", () => resolve())
      .save(outputPath);
  });
}

/** Cria uma sequência finita frente + trás para repetir a reação sem o salto
 * brusco do último quadro de volta para o primeiro. */
function createPingPongReaction(inputPath: string, outputPath: string, targetWidth: number, targetHeight: number) {
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath);
    const stderr: string[] = [];
    command
      .complexFilter([
        `[0:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=30,setsar=1,split=2[front][back]`,
        "[front]setpts=PTS-STARTPTS[forward]",
        "[back]reverse,setpts=PTS-STARTPTS[backward]",
        "[forward][backward]concat=n=2:v=1:a=0[outv]",
      ])
      .outputOptions([
        "-map",
        "[outv]",
        "-filter_complex_threads",
        "1",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-threads",
        String(ENCODE_THREADS),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      ])
      .on("stderr", (line) => stderr.push(line))
      .on("error", (error) => {
        const detail = stderr.slice(-8).join(" ").trim();
        reject(new Error(detail ? `${error.message} — ${detail}` : error.message));
      })
      .on("end", () => resolve())
      .save(outputPath);
  });
}

async function getPingPongReactionPath(
  inputPath: string,
  stableMediaId: string,
  targetWidth: number,
  targetHeight: number
) {
  const file = await stat(inputPath);
  const cacheKey = createHash("sha256")
    .update(`${stableMediaId}:${file.size}:${targetWidth}x${targetHeight}`)
    .digest("hex");
  const cachedPath = path.join(PING_PONG_CACHE_DIR, `${cacheKey}.mp4`);
  if (existsSync(cachedPath)) return cachedPath;

  const existing = pingPongReactionCache.get(cacheKey);
  if (existing) return existing;

  const pending = (async () => {
    await mkdir(PING_PONG_CACHE_DIR, { recursive: true });
    try {
      await createPingPongReaction(inputPath, cachedPath, targetWidth, targetHeight);
      return cachedPath;
    } catch (error) {
      await rm(cachedPath, { force: true });
      throw error;
    }
  })();
  pingPongReactionCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    pingPongReactionCache.delete(cacheKey);
    throw error;
  }
}

function contentInputOptions(item: BatchItem): string[] {
  const { trimStart, trimEnd } = item.manualOverrides;
  const options: string[] = [];
  if (trimStart > 0) options.push("-ss", String(trimStart));
  if (trimEnd !== null) options.push("-t", String(Math.max(0.1, trimEnd - trimStart)));
  return options;
}

async function renderTransformOnly(
  item: BatchItem,
  source: { width: number; height: number },
  contentPath: string,
  outputPath: string
) {
  const filters = buildContentFilters(item, source, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const filterGraph = [`[0:v]${filters.join(",")}[outv]`];
  await run([{ path: contentPath, options: contentInputOptions(item) }], filterGraph, outputPath, item);
}

async function renderUgc(
  item: BatchItem,
  profile: Profile,
  source: { width: number; height: number },
  contentPath: string,
  outputPath: string
) {
  if (profile.engine !== "UGC") throw new Error("Perfil não é UGC");
  const watermarkMedia = profile.watermarkImageUrl ? await materializeMediaUrl(profile.watermarkImageUrl) : null;
  if (!watermarkMedia) {
    await renderTransformOnly(item, source, contentPath, outputPath);
    return;
  }
  const wm = item.manualOverrides.watermarkPosition;
  const wmWidth = Math.max(32, Math.round(OUTPUT_WIDTH * 0.3 * wm.scale));
  const contentFilters = buildContentFilters(item, source, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const filterGraph = [
    `[0:v]${contentFilters.join(",")}[base]`,
    `[1:v]scale=${wmWidth}:-1,format=rgba,colorchannelmixer=aa=${wm.opacity}[wm]`,
    `[base][wm]overlay=x=${Math.round(wm.x * OUTPUT_WIDTH)}-overlay_w/2:y=${Math.round(wm.y * OUTPUT_HEIGHT)}-overlay_h/2:shortest=1[outv]`,
  ];
  try {
    await run(
      [
        { path: contentPath, options: contentInputOptions(item) },
        { path: watermarkMedia.path, options: ["-loop", "1"] },
      ],
      filterGraph,
      outputPath,
      item
    );
  } finally {
    await cleanupMaterializedMedia(watermarkMedia);
  }
}

async function renderReact(
  item: BatchItem,
  profile: Profile,
  source: { width: number; height: number },
  contentPath: string,
  outputPath: string
) {
  if (profile.engine !== "REACT") throw new Error("Perfil não é REACT");
  const selectedReaction = profile.reactionMedia.find(
    (media) => media.id === item.manualOverrides.reactionMediaId && (media.url || media.driveFileId)
  );
  // Lotes antigos podem ter sido criados antes da seleção da reação ser persistida.
  // Nesse caso, usar a primeira mídia válida do perfil mantém a exportação funcionando.
  const fallbackReaction = profile.reactionMedia.find((media) => media.url || media.driveFileId);
  let reactionUrl =
    selectedReaction?.url ??
    (selectedReaction?.driveFileId ? `/api/drive/media/${selectedReaction.driveFileId}` : null) ??
    fallbackReaction?.url ??
    (fallbackReaction?.driveFileId ? `/api/drive/media/${fallbackReaction.driveFileId}` : null);
  // Perfis gravados antes da persistência das mídias podem chegar à exportação sem o array
  // preenchido. O Drive continua sendo a fonte permanente: recupera a primeira reação da pasta.
  if (!reactionUrl && profile.handle) {
    const driveReaction = (await listFilesInFolder(reactionMediaFolderSegments(profile.handle)))[0];
    if (driveReaction?.id) reactionUrl = `/api/drive/media/${driveReaction.id}`;
  }
  const reactionMedia = reactionUrl ? await materializeMediaUrl(reactionUrl) : null;
  if (!reactionMedia) {
    throw new Error(
        `Perfil React "${profile.name}" não possui uma mídia de reação válida. ` +
        "Cadastre pelo menos um vídeo de reação nas configurações antes de exportar."
    );
  }
  // Keep every intermediate and final stream on even dimensions. libx264 with
  // yuv420p rejects odd heights, and rounding 36% directly produced 691px.
  const topHeight = Math.round((OUTPUT_HEIGHT * 0.36) / 2) * 2;
  const bottomHeight = OUTPUT_HEIGHT - topHeight;
  const contentFilters = buildContentFilters(item, source, OUTPUT_WIDTH, bottomHeight);
  const overlay = item.manualOverrides.reactOverlay;
  let overlayPath: string | null = null;
  let reactionInputPath = reactionMedia.path;
  let pingPongReaction = false;
  if (item.manualOverrides.reactionLoopMode === "pingpong") {
    reactionInputPath = await getPingPongReactionPath(
      reactionMedia.path,
      selectedReaction?.driveFileId ?? selectedReaction?.id ?? reactionUrl ?? reactionMedia.path,
      OUTPUT_WIDTH,
      topHeight
    );
    pingPongReaction = true;
  }
  if (overlay?.enabled && overlay.text.trim()) {
    await ensureTextFont();
    const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
    const ctx = image.getContext("2d");
    // PureImage cria o bitmap preto e opaco por padrão. Sem limpar, a PNG da tarja
    // cobria os dois vídeos com preto quando era sobreposta no quadro final.
    ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    // The React composition has one fixed seam: the tarja starts exactly
    // where the reaction panel ends. Keep this identical to the editor
    // preview instead of allowing independent top/center/bottom placement.
    const bannerY = topHeight;
    const fontSize = Math.max(24, Math.min(140, overlay.fontSize ?? 66));
    const lineHeight = Math.round(fontSize * 1.12);
    // Match the preview's 10px vertical padding at a 540px-wide editor frame,
    // scaled to the 1080px render canvas. The banner grows with its text instead
    // of reserving a fixed 240px for even a one-line title.
    const verticalPadding = Math.round(1080 * (10 / 540));
    const maxChars = Math.max(10, Math.floor((OUTPUT_WIDTH - 120) / (fontSize * 0.52)));
    const lineCount = Math.max(1, wrapText(overlay.text, maxChars, 3).length);
    const bannerHeight = verticalPadding * 2 + lineCount * lineHeight;
    const overlayColors: Record<string, string> = {
      red: "#ef2029",
      orange: "#ff7a00",
      purple: "#7c3aed",
      cyan: "#06b6d4",
      pink: "#ec4899",
      black: "#050505",
      white: "#f5f5f5",
    };
    const overlayAccents: Record<string, string> = {
      yellow: "#facc15",
      white: "#ffffff",
      black: "#111111",
      cyan: "#22d3ee",
      pink: "#f472b6",
    };
    const customBackground = /^#[0-9a-f]{6}$/i.test(overlay.customBackground ?? "")
      ? overlay.customBackground
      : overlayColors.red;
    const backgroundColor = overlay.background === "custom"
      ? customBackground
      : overlayColors[overlay.background] ?? overlayColors.red;
    const accentColor = overlayAccents[overlay.accent] ?? overlayAccents.yellow;
    if (overlay.template === "torn") {
      ctx.fillStyle = "#f4f1e8";
      drawTornBanner(ctx, bannerY, bannerHeight);
    }
    if (overlay.template === "gradient") {
      const gradient = ctx.createLinearGradient(0, bannerY, OUTPUT_WIDTH, bannerY + bannerHeight);
      gradient.addColorStop(0, hexColorToRgba(backgroundColor));
      gradient.addColorStop(1, hexColorToRgba(accentColor));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = backgroundColor;
    }
    if (overlay.template === "torn") drawTornBanner(ctx, bannerY, bannerHeight, 6);
    else ctx.fillRect(0, bannerY, OUTPUT_WIDTH, bannerHeight);
    await drawTextBlock(ctx, overlay.text, {
      x: 60,
      y: bannerY + verticalPadding,
      fontSize,
      maxWidth: OUTPUT_WIDTH - 120,
      maxLines: 3,
      lineHeight,
      weight: "bold",
      align: "center",
      color: overlay.textColor === "white" ? "white" : "black",
      fontFamily: RENDER_FONT_FAMILIES[overlay.font] ?? RENDER_FONT_FAMILIES.impact,
      ...(overlay.textOutline > 0
        ? {
            outlineColor: "#000000",
            outlineWidth: Math.round((Math.min(100, Math.max(0, overlay.textOutline)) / 100) * 14),
          }
        : {}),
    });
    overlayPath = outputPath.replace(/\.mp4$/i, "-react-overlay.png");
    await PImage.encodePNGToStream(image, createWriteStream(overlayPath));
  }
  const filterGraph = [
    pingPongReaction
      ? `[1:v]setsar=1,fps=30,setpts=PTS-STARTPTS[top]`
      : `[1:v]scale=${OUTPUT_WIDTH}:${topHeight}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${topHeight},setsar=1,fps=30,setpts=PTS-STARTPTS[top]`,
    `[0:v]${contentFilters.join(",")},setsar=1,setpts=PTS-STARTPTS[bottom]`,
    `[top][bottom]vstack=inputs=2[base]`,
    ...(overlayPath
      ? [
          `[2:v]format=rgba,setsar=1,fps=30[overlay]`,
          `[base][overlay]overlay=0:0:shortest=1[composed]`,
          `[composed]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[outv]`,
        ]
      : [
          `[base]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=decrease,pad=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[outv]`,
        ]),
  ];
  try {
    await run(
      [
        { path: contentPath, options: contentInputOptions(item) },
        { path: reactionInputPath, options: ["-stream_loop", "-1"] },
        ...(overlayPath ? [{ path: overlayPath, options: ["-loop", "1"] }] : []),
      ],
      filterGraph,
      outputPath,
      item
    );
  } finally {
    if (overlayPath) await rm(overlayPath, { force: true });
    await cleanupMaterializedMedia(reactionMedia);
  }
}

/** Quebra de linha manual (Enter no textarea) é intencional e precisa virar uma linha de
 *  verdade no render — por isso separa por parágrafo antes de colapsar espaços, em vez de
 *  substituir todo `\s+` (que apagava o `\n` do usuário junto com espaços/tabs). Dentro de cada
 *  parágrafo, ainda quebra automaticamente por largura como antes. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!text.trim()) return [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  const preferredMinimum = Math.floor(maxChars * 0.6);
  let truncated = false;

  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    let remaining = paragraph.replace(/[^\S\n]+/g, " ").trim();
    if (!remaining) {
      lines.push("");
      continue;
    }
    while (remaining) {
      if (lines.length >= maxLines) {
        truncated = true;
        break;
      }
      if (remaining.length <= maxChars) {
        lines.push(remaining);
        remaining = "";
        break;
      }
      const window = remaining.slice(0, maxChars + 1);
      let breakAt = window.lastIndexOf(" ");
      if (breakAt < preferredMinimum) breakAt = maxChars;
      lines.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) truncated = true;
  }

  if (truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].replace(/\s*\.{3}$/, "").slice(0, Math.max(1, maxChars - 3))}...`;
  }
  return lines;
}

async function loadEmojiImage(segment: string) {
  const filename = whatsappEmojiFilename(segment);
  const cacheKey = filename ?? emojiAssetCode(segment);
  if (!cacheKey) return null;
  const cached = emojiImageCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    if (!filename) return null;
    const emojiPath = path.join(WHATSAPP_EMOJI_DIR, filename);
    if (!existsSync(emojiPath)) return null;

    try {
      return await PImage.decodePNGFromStream(createReadStream(emojiPath));
    } catch {
      return null;
    }
  })();

  emojiImageCache.set(cacheKey, promise);
  return promise;
}

function measureRichText(ctx: ReturnType<ReturnType<typeof PImage.make>["getContext"]>, text: string, emojiSize: number) {
  let width = 0;
  let textRun = "";

  const flushTextRun = () => {
    if (!textRun) return;
    width += ctx.measureText(textRun).width;
    textRun = "";
  };

  for (const segment of splitGraphemes(text)) {
    if (isEmojiSegment(segment)) {
      flushTextRun();
      width += emojiSize;
    } else {
      textRun += segment;
    }
  }

  flushTextRun();
  return width;
}

async function drawRichText(
  ctx: ReturnType<ReturnType<typeof PImage.make>["getContext"]>,
  text: string,
  x: number,
  y: number,
  fontSize: number
) {
  const emojiSize = Math.round(fontSize * 1.05);
  let cursorX = x;
  let textRun = "";

  const flushTextRun = () => {
    if (!textRun) return;
    ctx.fillText(textRun, cursorX, y);
    cursorX += ctx.measureText(textRun).width;
    textRun = "";
  };

  for (const segment of splitGraphemes(text)) {
    if (isEmojiSegment(segment)) {
      flushTextRun();
      const emoji = await loadEmojiImage(segment);
      if (emoji) {
        ctx.drawImage(emoji, 0, 0, emoji.width, emoji.height, cursorX, y - Math.round(fontSize * 0.05), emojiSize, emojiSize);
      } else {
        ctx.fillText(segment, cursorX, y);
      }
      cursorX += emojiSize;
      continue;
    }

    textRun += segment;
  }

  flushTextRun();
}

async function ensureTextFont() {
  if (!textFontPromise) {
    textFontPromise = (async () => {
      const registrations = Object.entries(RENDER_FONT_PATHS).map(async ([font, fontPath]) => {
        if (existsSync(fontPath)) {
          await PImage.registerFont(fontPath, RENDER_FONT_FAMILIES[font as keyof typeof RENDER_FONT_FAMILIES]).load();
        }
      });
      await Promise.all(registrations);
    })();
  }
  await textFontPromise;
}

async function drawTextBlock(
  ctx: ReturnType<ReturnType<typeof PImage.make>["getContext"]>,
  text: string,
  options: {
    x: number;
    y: number;
    fontSize: number;
    maxWidth: number;
    maxLines: number;
    lineHeight: number;
    weight?: "bold";
    align?: "left" | "center";
    color?: "white" | "black";
    fontFamily?: string;
    outlineColor?: string;
    outlineWidth?: number;
  }
): Promise<void> {
  const maxChars = Math.max(10, Math.floor(options.maxWidth / (options.fontSize * 0.52)));
  const lines = wrapText(text, maxChars, options.maxLines);
  if (lines.length === 0) return;

  ctx.textBaseline = "top";
  for (const [index, line] of lines.entries()) {
    ctx.font = `${options.fontSize}pt ${options.fontFamily ?? "ZenxSans"}`;
    const lineWidth = measureRichText(ctx, line, Math.round(options.fontSize * 1.05));
    const x =
      options.align === "center"
        ? options.x + Math.max(0, (options.maxWidth - lineWidth) / 2)
        : options.x;
    if (options.outlineColor) {
      // PureImage's strokeText expands glyph paths with a path projector that can
      // collapse on duplicate points (notably in Impact/condensed glyphs), corrupting
      // the title. Build the outline from filled glyph copies instead.
      const radius = Math.max(0, options.outlineWidth ?? 0) / 2;
      if (radius > 0) {
        ctx.fillStyle = options.outlineColor;
        const steps = Math.max(12, Math.ceil(radius * 4));
        for (let step = 0; step < steps; step += 1) {
          const angle = (step / steps) * Math.PI * 2;
          ctx.fillText(
            line,
            x + Math.cos(angle) * radius,
            options.y + index * options.lineHeight + Math.sin(angle) * radius
          );
        }
      }
    }
    ctx.fillStyle = options.color ?? "black";
    await drawRichText(ctx, line, x, options.y + index * options.lineHeight, options.fontSize);
  }
}

async function createXStyleTextOverlay(item: BatchItem, profile: Profile, outputPath: string) {
  if (profile.engine !== "X_STYLE") return null;

  const layout = resolveXStyleLayout(profile.xStyleLayout);
  const title = item.manualOverrides.title || profile.defaultTitle || "";
  const color = profile.textColor ?? "black";
  await ensureTextFont();
  const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = image.getContext("2d");
  ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  await drawTextBlock(ctx, title, {
    x: layout.title.x,
    y: layout.title.y,
    fontSize: layout.title.fontSize,
    maxWidth: layout.title.maxWidth,
    maxLines: layout.title.maxLines,
    lineHeight: Math.round(layout.title.fontSize * 1.12),
    weight: "bold",
    color,
  });
  await drawTextBlock(ctx, item.manualOverrides.caption, {
    x: layout.body.x,
    y: layout.body.y,
    fontSize: layout.body.fontSize,
    maxWidth: layout.body.maxWidth,
    maxLines: layout.body.maxLines,
    lineHeight: Math.round(layout.body.fontSize * 1.12),
    weight: "bold",
    align: "center",
    color,
  });

  const overlayPath = outputPath.replace(/\.mp4$/i, "-text.png");
  await PImage.encodePNGToStream(image, createWriteStream(overlayPath));
  return overlayPath;
}

async function renderXStyle(
  item: BatchItem,
  profile: Profile,
  source: { width: number; height: number },
  contentPath: string,
  outputPath: string
) {
  if (profile.engine !== "X_STYLE") throw new Error("Perfil não é X_STYLE");
  let backgroundMedia: Awaited<ReturnType<typeof materializeMediaUrl>> = null;
  for (const backgroundUrl of xStyleBackgroundCandidates(profile)) {
    backgroundMedia = await materializeMediaUrl(backgroundUrl);
    if (backgroundMedia) break;
  }
  if (!backgroundMedia) throw new Error("Template X Style não encontrado. Reimporte o template do perfil antes de exportar.");

  const layout = resolveXStyleLayout(profile.xStyleLayout);
  const videoFrame = item.manualOverrides.xStyleVideoFrame ?? layout.video;
  const contentFilters = buildContentFilters(item, source, videoFrame.width, videoFrame.height);
  const textOverlayPath = await createXStyleTextOverlay(item, profile, outputPath);
  const filterGraph = [
    `[1:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}[bg]`,
    `[0:v]${contentFilters.join(",")}[content]`,
    `[bg][content]overlay=x=${videoFrame.x}:y=${videoFrame.y}:shortest=1[xbase]`,
    ...(textOverlayPath
      ? [`[2:v]format=rgba[text]`, `[xbase][text]overlay=0:0:shortest=1[outv]`]
      : [`[xbase]null[outv]`]),
  ];
  try {
    await run(
      [
        { path: contentPath, options: contentInputOptions(item) },
        { path: backgroundMedia.path, options: ["-loop", "1"] },
        ...(textOverlayPath ? [{ path: textOverlayPath, options: ["-loop", "1"] }] : []),
      ],
      filterGraph,
      outputPath,
      item
    );
  } finally {
    if (textOverlayPath) await rm(textOverlayPath, { force: true });
    await cleanupMaterializedMedia(backgroundMedia);
  }
}

export type RenderOutcome = { renderedUrl: string } | { error: string };

/**
 * Renderiza um BatchItem de verdade via ffmpeg: rotação/recorte/zoom/ajuste/corte/volume
 * universais, mais o composto específico de cada engine (UGC: overlay da marca d'água;
 * REACT: empilhamento vertical mídia de reação + conteúdo; X_STYLE: arte pronta como fundo,
 * título acima do conteúdo, vídeo centralizado e texto/CTA abaixo).
 */
export async function renderBatchItem(item: BatchItem, profile: Profile): Promise<RenderOutcome> {
  if (!item.contentUrl) {
    return { error: "Sem conteúdo real para renderizar (item vindo do Google Drive mockado)." };
  }
  const contentPath = publicUrlToPath(item.contentUrl);
  if (!existsSync(contentPath)) {
    return { error: "Arquivo de origem não encontrado no servidor." };
  }

  await mkdir(RENDER_DIR, { recursive: true });
  const outputFilename = `${item.id}.mp4`;
  const outputPath = path.join(RENDER_DIR, outputFilename);

  try {
    const source = await probeDimensions(contentPath);
    if (profile.engine === "UGC") {
      await renderUgc(item, profile, source, contentPath, outputPath);
    } else if (profile.engine === "REACT") {
      await renderReact(item, profile, source, contentPath, outputPath);
    } else if (profile.engine === "X_STYLE") {
      await renderXStyle(item, profile, source, contentPath, outputPath);
    } else {
      await renderTransformOnly(item, source, contentPath, outputPath);
    }
    return { renderedUrl: generatedFileUrl("renders", outputFilename) };
  } catch (err) {
    if (err instanceof Error) {
      // "fetch failed" sozinho esconde a causa real (DNS, TLS, conexão recusada) — Node
      // anexa isso em `cause`, sem isso o erro não dá pra diagnosticar remotamente.
      const cause = (err as Error & { cause?: unknown }).cause;
      const causeMessage = cause instanceof Error ? cause.message : cause ? String(cause) : null;
      return { error: causeMessage ? `${err.message}: ${causeMessage}` : err.message };
    }
    return { error: "Falha desconhecida ao renderizar." };
  }
}
