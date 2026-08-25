import ffmpegStatic from "ffmpeg-static";
// @ts-expect-error -- ffprobe-static ships no type declarations.
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import * as PImage from "pureimage";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { computeCropRect, effectiveDimensions } from "@/lib/editor/crop-geometry";
import { resolveXStyleLayout, type BatchItem, type CropBox, type Profile } from "@/lib/editor/types";
import { generatedFileUrl, generatedFolder, publicUrlToPath } from "@/lib/server/public-files";

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

const TEXT_FONT_PATH = existsSync("C:\\Windows\\Fonts\\arialbd.ttf")
  ? "C:\\Windows\\Fonts\\arialbd.ttf"
  : "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
let textFontPromise: Promise<void> | null = null;

/** Recorte "cover": mesmo cálculo usado pelo editor visual (components/editor/crop-editor.tsx)
 *  via lib/editor/crop-geometry.ts — prévia e vídeo final nunca divergem. */
function buildCropFilter(
  effWidth: number,
  effHeight: number,
  cropBox: CropBox,
  zoom: number,
  targetWidth: number,
  targetHeight: number
): string {
  const rect = computeCropRect(effWidth, effHeight, cropBox, zoom, targetWidth / targetHeight);
  return `crop=${Math.round(rect.width)}:${Math.round(rect.height)}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
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

/** Filtros universais aplicados ao vídeo de conteúdo de qualquer engine: rotação seguida de
 *  recorte+zoom ("Preencher") ou escala+barras ("Ajustar"), sempre terminando em targetW x
 *  targetH. */
function buildContentFilters(
  item: BatchItem,
  source: { width: number; height: number },
  targetWidth: number,
  targetHeight: number
): string[] {
  const { rotation, fit, cropBox, cropZoom } = item.manualOverrides;
  const filters = [...(ROTATE_FILTERS[rotation] ?? [])];
  const { width: effWidth, height: effHeight } = effectiveDimensions(source.width, source.height, rotation);

  if (fit === "contain") {
    // Posição do conteúdo dentro das barras (mesma lógica do object-position no preview) —
    // (ow-iw)*0.5 é o centro; usar cropBox.x/y no lugar do 0.5 fixo dá controle real de
    // "muito alto"/"muito baixo" em vez de sempre centralizar.
    filters.push(
      `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
      `pad=${targetWidth}:${targetHeight}:(ow-iw)*${cropBox.x}:(oh-ih)*${cropBox.y}:color=black`
    );
  } else {
    filters.push(buildCropFilter(effWidth, effHeight, cropBox, cropZoom, targetWidth, targetHeight));
    filters.push(`scale=${targetWidth}:${targetHeight}`);
  }
  return filters;
}

function run(inputs: Array<{ path: string; options?: string[] }>, filterGraph: string[], outputPath: string, item: BatchItem) {
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg();
    inputs.forEach(({ path: inputPath, options }) => {
      command.input(inputPath);
      if (options) command.inputOptions(options);
    });

    const outputOptions = ["-map", "[outv]"];
    if (!item.manualOverrides.muted) {
      outputOptions.push("-map", "0:a?", "-af", `volume=${item.manualOverrides.volume}`);
    }
    outputOptions.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart");

    command
      .complexFilter(filterGraph)
      .outputOptions(outputOptions)
      .on("error", (err) => reject(err))
      .on("end", () => resolve())
      .save(outputPath);
  });
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
  const watermarkPath = profile.watermarkImageUrl ? publicUrlToPath(profile.watermarkImageUrl) : null;
  if (!watermarkPath || !existsSync(watermarkPath)) {
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
  await run(
    [
      { path: contentPath, options: contentInputOptions(item) },
      { path: watermarkPath, options: ["-loop", "1"] },
    ],
    filterGraph,
    outputPath,
    item
  );
}

async function renderReact(
  item: BatchItem,
  profile: Profile,
  source: { width: number; height: number },
  contentPath: string,
  outputPath: string
) {
  if (profile.engine !== "REACT") throw new Error("Perfil não é REACT");
  const reactionUrl = profile.reactionMedia.find((m) => m.id === item.manualOverrides.reactionMediaId)?.url ?? null;
  const reactionPath = reactionUrl ? publicUrlToPath(reactionUrl) : null;
  if (!reactionPath || !existsSync(reactionPath)) {
    await renderTransformOnly(item, source, contentPath, outputPath);
    return;
  }
  const topHeight = Math.round(OUTPUT_HEIGHT * 0.36);
  const bottomHeight = OUTPUT_HEIGHT - topHeight;
  const contentFilters = buildContentFilters(item, source, OUTPUT_WIDTH, bottomHeight);
  const filterGraph = [
    `[1:v]scale=${OUTPUT_WIDTH}:${topHeight}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${topHeight}[top]`,
    `[0:v]${contentFilters.join(",")}[bottom]`,
    `[top][bottom]vstack=inputs=2[outv]`,
  ];
  await run(
    [
      { path: contentPath, options: contentInputOptions(item) },
      { path: reactionPath, options: ["-stream_loop", "-1"] },
    ],
    filterGraph,
    outputPath,
    item
  );
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  let remaining = text.replace(/\s+/g, " ").trim();
  if (!remaining) return [];
  const lines: string[] = [];
  const preferredMinimum = Math.floor(maxChars * 0.6);

  while (remaining && lines.length < maxLines) {
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

  if (remaining && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\.{3}$/, "").slice(0, Math.max(1, maxChars - 3))}...`;
  }
  return lines;
}

async function ensureTextFont() {
  if (!textFontPromise) {
    textFontPromise = PImage.registerFont(TEXT_FONT_PATH, "ZenxSans").load();
  }
  await textFontPromise;
}

function drawTextBlock(
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
  }
): void {
  const maxChars = Math.max(10, Math.floor(options.maxWidth / (options.fontSize * 0.52)));
  const lines = wrapText(text, maxChars, options.maxLines);
  if (lines.length === 0) return;

  ctx.fillStyle = "black";
  ctx.font = `${options.fontSize}pt ZenxSans`;
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, options.x, options.y + index * options.lineHeight);
  });
}

async function createXStyleTextOverlay(item: BatchItem, profile: Profile, outputPath: string) {
  if (profile.engine !== "X_STYLE") return null;

  const layout = resolveXStyleLayout(profile.xStyleLayout);
  const title = item.manualOverrides.title || profile.defaultTitle || "";
  await ensureTextFont();
  const image = PImage.make(OUTPUT_WIDTH, OUTPUT_HEIGHT);
  const ctx = image.getContext("2d");
  ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  drawTextBlock(ctx, title, {
    x: layout.title.x,
    y: layout.title.y,
    fontSize: layout.title.fontSize,
    maxWidth: layout.title.maxWidth,
    maxLines: layout.title.maxLines,
    lineHeight: Math.round(layout.title.fontSize * 1.12),
    weight: "bold",
  });
  drawTextBlock(ctx, item.manualOverrides.caption, {
    x: layout.body.x,
    y: layout.body.y,
    fontSize: layout.body.fontSize,
    maxWidth: layout.body.maxWidth,
    maxLines: layout.body.maxLines,
    lineHeight: Math.round(layout.body.fontSize * 1.25),
    weight: "bold",
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
  const backgroundPath = profile.backgroundImageUrl ? publicUrlToPath(profile.backgroundImageUrl) : null;
  if (!backgroundPath || !existsSync(backgroundPath)) {
    await renderTransformOnly(item, source, contentPath, outputPath);
    return;
  }

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
        { path: backgroundPath, options: ["-loop", "1"] },
        ...(textOverlayPath ? [{ path: textOverlayPath, options: ["-loop", "1"] }] : []),
      ],
      filterGraph,
      outputPath,
      item
    );
  } finally {
    if (textOverlayPath) await rm(textOverlayPath, { force: true });
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
    return { error: err instanceof Error ? err.message : "Falha desconhecida ao renderizar." };
  }
}
