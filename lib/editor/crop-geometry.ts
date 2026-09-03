import type { AspectMode, Crop, Engine, Rotation, XStyleVideoFrame } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const REACT_REACTION_HEIGHT_RATIO = 0.36;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Proporção alvo do conteúdo por engine — mesmo cálculo usado pelo editor visual de recorte
 *  (components/editor/crop-box-editor.tsx), pela prévia (components/editor/video-frame.tsx) e
 *  pelo render real (lib/server/render.ts). Única fonte de verdade: um valor errado aqui faz a
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

/** Dimensões efetivas após rotação — 90°/270° trocam largura por altura. Usado tanto pelo
 *  cálculo de recorte quanto pela prévia visual, pra nunca divergirem. */
export function effectiveDimensions(width: number, height: number, rotation: Rotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Converte o recorte normalizado (0 a 1) em pixels reais da origem, com arredondamento e
 *  limites seguros pro encoder — única fonte de verdade usada tanto pela prévia quanto pelo
 *  render real (lib/server/render.ts). cropWidth = sourceWidth*crop.width e assim por diante,
 *  como pedido: nunca depende do tamanho do preview na tela. */
export function normalizedCropToPixels(crop: Crop, sourceWidth: number, sourceHeight: number): Rect {
  const width = Math.max(2, Math.round(sourceWidth * crop.width));
  const height = Math.max(2, Math.round(sourceHeight * crop.height));
  const x = clamp(Math.round(sourceWidth * crop.x), 0, sourceWidth - width);
  const y = clamp(Math.round(sourceHeight * crop.y), 0, sourceHeight - height);
  return { x, y, width, height };
}

/** Inverso de normalizedCropToPixels — usado pela detecção automática de bordas e pelo editor
 *  visual ao converter um retângulo arrastado de volta para o estado normalizado. */
export function pixelsToNormalizedCrop(rect: Rect, sourceWidth: number, sourceHeight: number): Crop {
  return {
    x: clamp(rect.x / sourceWidth, 0, 1),
    y: clamp(rect.y / sourceHeight, 0, 1),
    width: clamp(rect.width / sourceWidth, 0, 1),
    height: clamp(rect.height / sourceHeight, 0, 1),
  };
}

/** Recorte central adicional aplicado ao conteúdo já selecionado por `crop`, pra reconciliar
 *  com a proporção do quadro alvo: "zoom" aperta essa janela central (aproximando), e o
 *  resultado sempre preenche o quadro alvo por completo, sem nunca esticar. Reaproveitado por
 *  fit="cover" tanto na prévia quanto no render real — a mesma função, os mesmos números. */
export function fitCenteredRect(width: number, height: number, zoom: number, targetAspect: number): Rect {
  let w: number;
  let h: number;
  if (width / height > targetAspect) {
    h = height / zoom;
    w = h * targetAspect;
  } else {
    w = width / zoom;
    h = w / targetAspect;
  }
  w = Math.min(w, width);
  h = Math.min(h, height);
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

/** Proporção numérica (largura/altura) de cada modo do seletor "Proporção" do editor visual.
 *  null = livre (o usuário pode criar qualquer formato). */
export function resolveAspectRatio(mode: AspectMode, sourceAspect: number, targetAspect: number): number | null {
  switch (mode) {
    case "free":
      return null;
    case "original":
      return sourceAspect;
    case "9:16":
      return 9 / 16;
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    case "template":
      return targetAspect;
    default:
      return null;
  }
}

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

function clampRect(rect: Rect, stageWidth: number, stageHeight: number, minSize: number): Rect {
  const width = clamp(rect.width, minSize, stageWidth);
  const height = clamp(rect.height, minSize, stageHeight);
  const x = clamp(rect.x, 0, stageWidth - width);
  const y = clamp(rect.y, 0, stageHeight - height);
  return { x, y, width, height };
}

/** Núcleo do editor visual de recorte: aplica um gesto de arrastar (mover a moldura inteira,
 *  uma borda, ou um canto) a um retângulo em espaço de pixels do estágio (que sempre reflete
 *  a origem na proporção real — ver crop-box-editor.tsx), respeitando os limites do vídeo,
 *  um tamanho mínimo, e a proporção travada (quando houver). Puro e testável isoladamente. */
export function applyCropDrag(
  box: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  stageWidth: number,
  stageHeight: number,
  minSize: number,
  lockedAspect: number | null
): Rect {
  if (handle === "move") {
    return clampRect({ x: box.x + dx, y: box.y + dy, width: box.width, height: box.height }, stageWidth, stageHeight, minSize);
  }

  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;

  let newLeft = left;
  let newTop = top;
  let newRight = right;
  let newBottom = bottom;

  if (handle.includes("w")) newLeft = clamp(left + dx, 0, right - minSize);
  if (handle.includes("e")) newRight = clamp(right + dx, left + minSize, stageWidth);
  if (handle.includes("n")) newTop = clamp(top + dy, 0, bottom - minSize);
  if (handle.includes("s")) newBottom = clamp(bottom + dy, top + minSize, stageHeight);

  let width = newRight - newLeft;
  let height = newBottom - newTop;

  if (lockedAspect) {
    const isCorner = handle.length === 2;
    if (isCorner) {
      // Ancorado no canto oposto ao que está sendo arrastado — segue a dimensão que mudou
      // mais (em relação à proporção travada) pra um arraste na diagonal responder de forma
      // natural em qualquer ângulo, igual ao redimensionamento do editor anterior.
      if (Math.abs(width - box.width) > Math.abs(height - box.height) * lockedAspect) {
        height = width / lockedAspect;
      } else {
        width = height * lockedAspect;
      }
      if (handle.includes("w")) newLeft = newRight - width;
      else newRight = newLeft + width;
      if (handle.includes("n")) newTop = newBottom - height;
      else newBottom = newTop + height;
    } else {
      // Uma única borda: ajusta a dimensão perpendicular simetricamente ao redor do centro
      // atual, em vez de travar um dos lados opostos arbitrariamente.
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      if (handle === "e" || handle === "w") {
        height = width / lockedAspect;
        newTop = centerY - height / 2;
        newBottom = centerY + height / 2;
      } else {
        width = height * lockedAspect;
        newLeft = centerX - width / 2;
        newRight = centerX + width / 2;
      }
    }
  }

  return clampRect({ x: newLeft, y: newTop, width: newRight - newLeft, height: newBottom - newTop }, stageWidth, stageHeight, minSize);
}

export function cursorForHandle(handle: CropHandle): string {
  switch (handle) {
    case "move":
      return "move";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    default:
      return "default";
  }
}
