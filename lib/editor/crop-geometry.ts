import type { CropBox, Engine, Rotation, SourceTrim, XStyleVideoFrame } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const REACT_REACTION_HEIGHT_RATIO = 0.36;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Proporção alvo do conteúdo por engine — mesmo cálculo usado pelo editor visual de recorte
 *  (components/editor/crop-editor.tsx), pela prévia (components/editor/video-frame.tsx) e pelo
 *  render real (lib/server/render.ts). Única fonte de verdade: um valor errado aqui faz a
 *  prévia e o vídeo final divergirem silenciosamente. */
export function contentTargetAspect(engine: Engine, xStyleVideoFrame?: Pick<XStyleVideoFrame, "width" | "height"> | null): number {
  if (engine === "REACT") {
    const topHeight = Math.round(OUTPUT_HEIGHT * REACT_REACTION_HEIGHT_RATIO);
    return OUTPUT_WIDTH / (OUTPUT_HEIGHT - topHeight);
  }
  if (engine === "X_STYLE" && xStyleVideoFrame) {
    return xStyleVideoFrame.width / xStyleVideoFrame.height;
  }
  return OUTPUT_WIDTH / OUTPUT_HEIGHT;
}

/** Dimensões de pixel após aparar as bordas detectadas/definidas manualmente (barras pretas
 *  gravadas no arquivo original) — aplicado antes de qualquer recorte/zoom/preenchimento,
 *  então nunca força proporção nem "come" conteúdo real: só remove exatamente a faixa marcada. */
export function applySourceTrim(width: number, height: number, trim: SourceTrim): Rect {
  const trimmedWidth = Math.max(2, Math.round(width * (1 - trim.left - trim.right)));
  const trimmedHeight = Math.max(2, Math.round(height * (1 - trim.top - trim.bottom)));
  return {
    x: Math.round(width * trim.left),
    y: Math.round(height * trim.top),
    width: trimmedWidth,
    height: trimmedHeight,
  };
}

/** Dimensões efetivas após rotação — 90°/270° trocam largura por altura. Usado tanto pelo
 *  cálculo de recorte quanto pela prévia visual, pra nunca divergirem. */
export function effectiveDimensions(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Retângulo de recorte em espaço de pixels da origem (já em dimensões efetivas, pós-
 *  rotação). Única fonte de verdade pro cálculo de recorte "cover": usada tanto pelo editor
 *  visual (components/editor/crop-editor.tsx) quanto pelo render real (lib/server/render.ts)
 *  — sem isso, prévia e vídeo final podem silenciosamente divergir. */
export function computeCropRect(
  effWidth: number,
  effHeight: number,
  cropBox: CropBox,
  zoom: number,
  targetAspect: number
): Rect {
  let width: number;
  let height: number;
  if (effWidth / effHeight > targetAspect) {
    height = effHeight / zoom;
    width = height * targetAspect;
  } else {
    width = effWidth / zoom;
    height = width / targetAspect;
  }
  width = Math.min(width, effWidth);
  height = Math.min(height, effHeight);
  const x = clamp(cropBox.x * effWidth - width / 2, 0, effWidth - width);
  const y = clamp(cropBox.y * effHeight - height / 2, 0, effHeight - height);
  return { x, y, width, height };
}

/** Inverso: dado um retângulo (ex.: arrastado/redimensionado pelo usuário no editor visual),
 *  deriva cropBox (centro relativo) e zoom equivalentes, compatíveis com computeCropRect. */
export function rectToCropBoxAndZoom(
  rect: Rect,
  effWidth: number,
  effHeight: number,
  targetAspect: number,
  maxZoom: number
): { cropBox: CropBox; zoom: number } {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const zoom = effWidth / effHeight > targetAspect ? effHeight / rect.height : effWidth / rect.width;
  return {
    cropBox: { x: clamp(centerX / effWidth, 0, 1), y: clamp(centerY / effHeight, 0, 1) },
    zoom: clamp(zoom, 1, maxZoom),
  };
}
