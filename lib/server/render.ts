import ffmpegStatic from "ffmpeg-static";
// @ts-expect-error -- ffprobe-static ships no type declarations.
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BatchItem, CropBox, Profile } from "@/lib/editor/types";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath((ffprobeStatic as { path: string }).path);

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const RENDER_DIR = path.join(process.cwd(), "public", "renders");

function publicUrlToPath(url: string): string {
  return path.join(process.cwd(), "public", url.replace(/^\//, ""));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const ROTATE_FILTERS: Record<number, string[]> = {
  0: [],
  90: ["transpose=1"],
  180: ["hflip", "vflip"],
  270: ["transpose=2"],
};

function effectiveDimensions(width: number, height: number, rotation: number) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Recorte "cover": mantém o aspect ratio alvo, corta o excedente ao redor do centro
 *  escolhido (cropBox), sem nunca esticar a imagem. Zoom > 1 aperta a janela de recorte. */
function buildCropFilter(
  srcWidth: number,
  srcHeight: number,
  cropBox: CropBox,
  zoom: number,
  targetWidth: number,
  targetHeight: number
): string {
  const targetAspect = targetWidth / targetHeight;
  let cropWidth: number;
  let cropHeight: number;
  if (srcWidth / srcHeight > targetAspect) {
    cropHeight = srcHeight / zoom;
    cropWidth = cropHeight * targetAspect;
  } else {
    cropWidth = srcWidth / zoom;
    cropHeight = cropWidth / targetAspect;
  }
  cropWidth = Math.min(cropWidth, srcWidth);
  cropHeight = Math.min(cropHeight, srcHeight);
  const x = clamp(cropBox.x * srcWidth - cropWidth / 2, 0, srcWidth - cropWidth);
  const y = clamp(cropBox.y * srcHeight - cropHeight / 2, 0, srcHeight - cropHeight);
  return `crop=${Math.round(cropWidth)}:${Math.round(cropHeight)}:${Math.round(x)}:${Math.round(y)}`;
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

export type RenderOutcome = { renderedUrl: string } | { error: string };

/**
 * Renderiza um BatchItem de verdade via ffmpeg: rotação/recorte/zoom/ajuste/corte/volume
 * universais, mais o composto específico de cada engine (UGC: overlay da marca d'água;
 * REACT: empilhamento vertical mídia de reação + conteúdo). X_STYLE ainda não compõe a
 * moldura de identidade (avatar/handle/legenda) no vídeo final — isso fica para uma
 * evolução futura do pipeline; a legenda em si já vai como metadado na publicação.
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
    } else {
      await renderTransformOnly(item, source, contentPath, outputPath);
    }
    return { renderedUrl: `/renders/${outputFilename}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha desconhecida ao renderizar." };
  }
}
