import type { CropBox, SourceAnalysis } from "./types";

const MAX_BORDER_SCAN_RATIO = 0.22;
const SAMPLE_STEP = 8;
const DARK_LUMA_THRESHOLD = 20;

const MAX_SUGGESTED_ZOOM = 2;

const NEUTRAL_ANALYSIS: Omit<SourceAnalysis, "width" | "height" | "aspectRatio"> = {
  hasLetterboxing: false,
  suggestedCropBox: { x: 0.5, y: 0.5 },
  suggestedZoom: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function rowLuminance(data: Uint8ClampedArray, width: number, y: number): number {
  let total = 0;
  let count = 0;
  for (let x = 0; x < width; x += SAMPLE_STEP) {
    const i = (y * width + x) * 4;
    total += luminance(data[i], data[i + 1], data[i + 2]);
    count++;
  }
  return count > 0 ? total / count : 255;
}

function columnLuminance(data: Uint8ClampedArray, width: number, height: number, x: number): number {
  let total = 0;
  let count = 0;
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    const i = (y * width + x) * 4;
    total += luminance(data[i], data[i + 1], data[i + 2]);
    count++;
  }
  return count > 0 ? total / count : 255;
}

/** Cresce uma borda (topo/base/esquerda/direita) enquanto a faixa amostrada continuar
 *  uniformemente escura, até um limite máximo (nunca considera o frame inteiro uma borda). */
function detectBorders(data: Uint8ClampedArray, width: number, height: number) {
  const maxVertical = Math.floor(height * MAX_BORDER_SCAN_RATIO);
  const maxHorizontal = Math.floor(width * MAX_BORDER_SCAN_RATIO);

  let top = 0;
  while (top < maxVertical && rowLuminance(data, width, top) < DARK_LUMA_THRESHOLD) top++;

  let bottom = 0;
  while (
    bottom < maxVertical &&
    rowLuminance(data, width, height - 1 - bottom) < DARK_LUMA_THRESHOLD
  )
    bottom++;

  let left = 0;
  while (left < maxHorizontal && columnLuminance(data, width, height, left) < DARK_LUMA_THRESHOLD)
    left++;

  let right = 0;
  while (
    right < maxHorizontal &&
    columnLuminance(data, width, height, width - 1 - right) < DARK_LUMA_THRESHOLD
  )
    right++;

  return { top, bottom, left, right };
}

/** Analisa um frame já desenhado no canvas: detecta barras pretas/bordas uniformes e sugere
 *  um recorte que prioriza remover essas áreas, centralizando o conteúdo restante — nunca
 *  estica, só recorta.
 *
 *  Detectar a posição sozinha não bastava: se a origem já tem a mesma proporção do quadro
 *  alvo (comum em vídeo vertical), o recorte a zoom 1x cobre o frame inteiro e mover a
 *  posição não tem nenhum efeito visível — não sobra espaço pra deslocar. O zoom sugerido
 *  aqui aperta a janela de recorte o suficiente pra excluir as barras detectadas, o que
 *  também é o que dá "folga" real pra reposicionar depois. */
export function analyzeFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { hasLetterboxing: boolean; suggestedCropBox: CropBox; suggestedZoom: number } {
  const { top, bottom, left, right } = detectBorders(
    ctx.getImageData(0, 0, width, height).data,
    width,
    height
  );
  const hasLetterboxing = top + bottom + left + right > 0;
  const contentWidth = Math.max(1, width - left - right);
  const contentHeight = Math.max(1, height - top - bottom);
  const centerX = (left + contentWidth / 2) / width;
  const centerY = (top + contentHeight / 2) / height;
  const zoomForWidth = width / contentWidth;
  const zoomForHeight = height / contentHeight;
  const suggestedZoom = clamp(Math.max(zoomForWidth, zoomForHeight), 1, MAX_SUGGESTED_ZOOM);
  return {
    hasLetterboxing,
    suggestedCropBox: { x: clamp(centerX, 0, 1), y: clamp(centerY, 0, 1) },
    suggestedZoom,
  };
}

/** Carrega o vídeo, captura um frame e roda a análise. Nunca rejeita: em caso de falha
 *  (formato não suportado, canvas "tainted" etc.) resolve com uma análise neutra, sem
 *  sugestão de recorte. */
export function analyzeVideoSource(url: string): Promise<SourceAnalysis> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    function finish(result: SourceAnalysis) {
      video.removeAttribute("src");
      video.load();
      resolve(result);
    }

    video.addEventListener("error", () => finish({ width: 0, height: 0, aspectRatio: 9 / 16, ...NEUTRAL_ANALYSIS }));

    video.addEventListener(
      "loadeddata",
      () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          finish({ width: 0, height: 0, aspectRatio: 9 / 16, ...NEUTRAL_ANALYSIS });
          return;
        }
        const base = { width, height, aspectRatio: width / height };
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish({ ...base, ...NEUTRAL_ANALYSIS });
          return;
        }
        try {
          ctx.drawImage(video, 0, 0, width, height);
          const { hasLetterboxing, suggestedCropBox, suggestedZoom } = analyzeFrame(ctx, width, height);
          finish({ ...base, hasLetterboxing, suggestedCropBox, suggestedZoom });
        } catch {
          finish({ ...base, ...NEUTRAL_ANALYSIS });
        }
      },
      { once: true }
    );

    video.src = url;
  });
}
