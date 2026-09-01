import type { CropBox, Rotation } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
