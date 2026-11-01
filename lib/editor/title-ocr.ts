import { analyzeVideoSource, needsCors } from "./source-analysis";
import type { Crop, Rotation } from "./types";

/** Leitura automática do título de reposts (o texto que fica entre o cabeçalho com avatar/nome e
 *  o vídeo). Roda no navegador com Tesseract (OCR) em português — arquivos em public/tesseract,
 *  sem depender de CDN. O título só é procurado na faixa colada em cima do vídeo (já recortado
 *  pelo recorte inteligente), nunca no cabeçalho. */

export type OcrLine = {
  text: string;
  confidence: number;
  /** Posições em pixels dentro da faixa analisada. */
  top: number;
  bottom: number;
};

const MIN_LINE_CONFIDENCE = 55;
const MIN_HEADER_HEIGHT_RATIO = 0.05;
const BAND_HEIGHT_RATIO = 0.2;
const MAX_GAP_TO_VIDEO_RATIO = 0.035;
const MAX_TITLE_LENGTH = 120;

/** Remove sobras típicas do OCR: emoji lido como símbolo solto, barras e pontuação nas pontas. */
export function cleanTitle(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(/^[^\p{L}\p{N}"'“‘¿¡(]+/u, "");
  // Emoji no fim da linha é lido como uma "palavra" curta e sem minúsculas ("SOS", "S&S", "7)",
  // "7”", "Q"). Texto de verdade termina em palavra com minúscula ou em 4+ letras ("KKKKKKK").
  const tokens = text.split(" ");
  while (tokens.length > 2) {
    const last = tokens[tokens.length - 1];
    const looksLikeEmoji = last.length <= 3 && !/\p{Ll}/u.test(last) && !/^K{3}$/i.test(last);
    if (!looksLikeEmoji) break;
    tokens.pop();
  }
  text = tokens.join(" ").replace(/[^\p{L}\p{N}"'”’!?.…)]+$/u, "");
  return text.slice(0, MAX_TITLE_LENGTH).trim();
}

/** Escolhe o título entre as linhas lidas na faixa em cima do vídeo (puro, testável):
 *  - descarta linhas pouco confiáveis, muito curtas ou com "@" (usuário/marca d'água);
 *  - a linha mais baixa precisa estar colada no vídeo (senão não há título — é só cabeçalho);
 *  - sobe juntando linhas enquanto o espaçamento for de uma linha de texto (título em 2 linhas),
 *    parando no primeiro vão maior (separação do cabeçalho). */
export function pickTitleFromLines(lines: OcrLine[], bandHeight: number, maxGapToVideo: number): string | null {
  const usable = lines
    .filter((line) => line.confidence >= MIN_LINE_CONFIDENCE && line.text.trim().length >= 3 && !line.text.includes("@"))
    .sort((a, b) => b.bottom - a.bottom);
  if (usable.length === 0) return null;
  if (bandHeight - usable[0].bottom > maxGapToVideo) return null;

  const chosen = [usable[0]];
  for (const line of usable.slice(1)) {
    const above = chosen[chosen.length - 1];
    const lineHeight = Math.max(8, line.bottom - line.top);
    if (above.top - line.bottom > lineHeight * 1.0) break;
    chosen.push(line);
  }
  const text = cleanTitle(
    chosen
      .reverse()
      .map((line) => line.text.trim())
      .join(" ")
  );
  return text.length >= 3 ? text : null;
}

type TesseractWorker = import("tesseract.js").Worker;
let workerPromise: Promise<TesseractWorker> | null = null;

function getWorker(): Promise<TesseractWorker> {
  workerPromise ??= (async () => {
    const { createWorker } = await import("tesseract.js");
    const base = `${window.location.origin}/tesseract`;
    const worker = await createWorker("por", 1, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/tesseract-core-simd-lstm.wasm.js`,
      langPath: base,
      workerBlobURL: false,
      gzip: true,
    });
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
    return worker;
  })().catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

export async function disposeTitleOcr() {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await (await pending.catch(() => null))?.terminate();
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (needsCors(url)) video.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => reject(new Error("timeout ao abrir o vídeo")), 30000);
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timer);
        resolve(video);
      },
      { once: true }
    );
    video.addEventListener("error", () => reject(new Error("não foi possível abrir o vídeo")), { once: true });
    video.src = url;
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout ao buscar o quadro")), 15000);
    video.addEventListener(
      "seeked",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    video.currentTime = time;
  });
}

/** Lê o título de um vídeo importado. Devolve null quando não há título (ou não deu para ler).
 *  `crop` é o recorte atual do item; se ele ainda é o quadro inteiro, usa o recorte inteligente. */
export async function extractVideoTitle(url: string, crop: Crop, rotation: Rotation): Promise<string | null> {
  if (rotation !== 0) return null;

  let topFraction = crop.y;
  if (topFraction < MIN_HEADER_HEIGHT_RATIO) {
    topFraction = (await analyzeVideoSource(url)).suggestedCrop.y;
  }
  if (topFraction < MIN_HEADER_HEIGHT_RATIO) return null; // sem cabeçalho acima do vídeo

  const video = await loadVideo(url);
  try {
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) return null;
    await seek(video, Math.min(1, Math.max(0, (video.duration || 1) * 0.1)));

    const videoTop = Math.round(height * topFraction);
    const bandHeight = Math.min(videoTop, Math.round(height * BAND_HEIGHT_RATIO));
    const bandTop = videoTop - bandHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = bandHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, bandTop, width, bandHeight, 0, 0, width, bandHeight);

    // Texto claro sobre fundo escuro (repost em modo escuro): inverte para o OCR ler melhor.
    const image = ctx.getImageData(0, 0, width, bandHeight);
    let sum = 0;
    for (let i = 0; i < image.data.length; i += 4) sum += image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
    if (sum / (image.data.length / 4) < 110) {
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = 255 - image.data[i];
        image.data[i + 1] = 255 - image.data[i + 1];
        image.data[i + 2] = 255 - image.data[i + 2];
      }
      ctx.putImageData(image, 0, 0);
    }

    const worker = await getWorker();
    const result = await worker.recognize(canvas, {}, { blocks: true });
    const lines: OcrLine[] = (result.data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text,
          confidence: line.confidence,
          top: line.bbox.y0,
          bottom: line.bbox.y1,
        }))
      )
    );
    return pickTitleFromLines(lines, bandHeight, Math.round(height * MAX_GAP_TO_VIDEO_RATIO));
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
