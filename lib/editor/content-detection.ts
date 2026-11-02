import type { Crop } from "./types";

/** Detecção do retângulo "real" de um vídeo dentro do quadro importado — pensada para fontes
 *  como gravações de tela/reposts (cabeçalho com avatar e legenda, vídeo no meio, faixas
 *  brancas ou pretas em volta), onde o conteúdo útil é só o miolo que se mexe.
 *
 *  Entrada: vários quadros em escala de cinza (luma) do MESMO vídeo, em tempos diferentes.
 *  Pura e sem DOM, para ser testável isoladamente. A extração dos quadros fica em
 *  lib/editor/source-analysis.ts. */

export type DetectionMethod = "motion" | "borders" | "seams" | "none";

export type ContentDetection = {
  crop: Crop;
  method: DetectionMethod;
  /** 0 a 1 — quão segura é a detecção (só informativa; método "none" = 0). */
  confidence: number;
};

const MOTION_THRESHOLD = 24; // variação de luma (0-255) entre quadros para contar como movimento
const MIN_ACTIVE_RATIO = 0.04; // fração da largura/altura com movimento para a linha/coluna contar
const MERGE_GAP_RATIO = 0.03; // buracos menores que isso entre trechos ativos são unidos
const MIN_MOTION_DENSITY = 0.15; // movimento dentro da caixa detectada
const MIN_CONTENT_AREA = 0.15; // abaixo disso a detecção é descartada
const MAX_USEFUL_AREA = 0.94; // acima disso o recorte não vale a pena (já é o quadro todo)
const BORDER_MAX_TRIM = 0.4;
const BORDER_UNIFORM_STD = 8;
const BORDER_COLOR_TOLERANCE = 10;
const PAD_RATIO = 0; // sem folga: a legenda do repost costuma encostar no vídeo
const EDGE_TRIM_MAX_RATIO = 0.05; // quanto cada lado pode encolher ao tirar fios do fundo
const EDGE_BG_TOLERANCE = 14;
const EDGE_BG_FRACTION = 0.88;
const SNAP_RATIO = 0.03;
const TEXT_ROW_BG_FRACTION = 0.72; // linha de legenda: quase tudo fundo, com poucos pixels de letra
const TEXT_TRIM_MAX_RATIO = 0.35; // quanto da caixa pode ser legenda no topo/base

type Span = { start: number; end: number; weight: number };

function longestActiveSpan(counts: number[], minActive: number, maxGap: number): Span | null {
  const spans: Span[] = [];
  let current: Span | null = null;
  let gap = 0;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= minActive) {
      if (current && gap <= maxGap) {
        current.end = i;
        current.weight += counts[i];
      } else {
        if (current) spans.push(current);
        current = { start: i, end: i, weight: counts[i] };
      }
      gap = 0;
    } else if (current) {
      gap += 1;
    }
  }
  if (current) spans.push(current);
  if (spans.length === 0) return null;
  return spans.reduce((best, span) => (span.weight > best.weight ? span : best));
}

function detectByMotion(frames: Uint8Array[], width: number, height: number) {
  if (frames.length < 2) return null;
  const total = width * height;
  const rowCounts = new Array<number>(height).fill(0);
  const colCounts = new Array<number>(width).fill(0);
  const moving = new Uint8Array(total);
  let movingTotal = 0;

  for (let i = 0; i < total; i += 1) {
    let min = 255;
    let max = 0;
    for (const frame of frames) {
      const value = frame[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min > MOTION_THRESHOLD) {
      moving[i] = 1;
      movingTotal += 1;
      rowCounts[(i / width) | 0] += 1;
      colCounts[i % width] += 1;
    }
  }
  if (movingTotal === 0) return null;

  const rows = longestActiveSpan(rowCounts, Math.max(2, width * MIN_ACTIVE_RATIO), Math.max(1, height * MERGE_GAP_RATIO));
  const cols = longestActiveSpan(colCounts, Math.max(2, height * MIN_ACTIVE_RATIO), Math.max(1, width * MERGE_GAP_RATIO));
  if (!rows || !cols) return null;

  let inside = 0;
  for (let y = rows.start; y <= rows.end; y += 1) {
    for (let x = cols.start; x <= cols.end; x += 1) inside += moving[y * width + x];
  }
  const boxArea = (rows.end - rows.start + 1) * (cols.end - cols.start + 1);
  return {
    left: cols.start,
    right: cols.end + 1,
    top: rows.start,
    bottom: rows.end + 1,
    density: inside / boxArea,
  };
}

/** Média e desvio da linha/coluna sobre a média dos quadros — barras estáticas e uniformes
 *  (pretas, brancas ou de qualquer cor) têm desvio baixo e cor igual à da borda. */
function lineStats(mean: Float32Array, width: number, fixed: number, from: number, to: number, horizontal: boolean) {
  let sum = 0;
  let sumSq = 0;
  const n = to - from;
  for (let i = from; i < to; i += 1) {
    const v = horizontal ? mean[fixed * width + i] : mean[i * width + fixed];
    sum += v;
    sumSq += v * v;
  }
  const avg = sum / n;
  return { avg, std: Math.sqrt(Math.max(0, sumSq / n - avg * avg)) };
}

function averageFrame(frames: Uint8Array[], total: number) {
  const mean = new Float32Array(total);
  for (const frame of frames) for (let i = 0; i < total; i += 1) mean[i] += frame[i] / frames.length;
  return mean;
}

/** Quantas linhas/colunas uniformes (mesma cor, sem textura) existem a partir da borda. */
function trimUniform(limit: number, count: number, read: (index: number) => { avg: number; std: number }) {
  const edge = read(0);
  if (edge.std > BORDER_UNIFORM_STD) return 0;
  let trimmed = 0;
  while (trimmed < limit && trimmed < count) {
    const line = read(trimmed);
    if (line.std > BORDER_UNIFORM_STD || Math.abs(line.avg - edge.avg) > BORDER_COLOR_TOLERANCE) break;
    trimmed += 1;
  }
  return trimmed;
}

/** Faixas uniformes nas laterais, medidas só entre `top` e `bottom`. */
function trimSideBars(mean: Float32Array, width: number, top: number, bottom: number) {
  const maxH = Math.floor(width * BORDER_MAX_TRIM);
  const left = trimUniform(maxH, width, (i) => lineStats(mean, width, i, top, bottom, false));
  const right = trimUniform(maxH, width, (i) => lineStats(mean, width, width - 1 - i, top, bottom, false));
  return { left, right };
}

function detectByBorders(frames: Uint8Array[], width: number, height: number) {
  const mean = averageFrame(frames, width * height);
  const maxV = Math.floor(height * BORDER_MAX_TRIM);
  const top = trimUniform(maxV, height, (i) => lineStats(mean, width, i, 0, width, true));
  const bottom = trimUniform(maxV, height, (i) => lineStats(mean, width, height - 1 - i, 0, width, true));
  const sides = trimSideBars(mean, width, top, height - bottom);

  if (top + bottom + sides.left + sides.right === 0) return null;
  return { left: sides.left, right: width - sides.right, top, bottom: height - bottom };
}

/** Cor de fundo dominante FORA da caixa (cabeçalho/faixas do repost — em geral branco ou preto). */
function backgroundLuma(mean: Float32Array, width: number, height: number, box: Box) {
  const bins = new Array<number>(32).fill(0);
  let outside = 0;
  for (let y = 0; y < height; y += 1) {
    const insideRows = y >= box.top && y < box.bottom;
    for (let x = 0; x < width; x += 1) {
      if (insideRows && x >= box.left && x < box.right) continue;
      bins[Math.min(31, mean[y * width + x] >> 3)] += 1;
      outside += 1;
    }
  }
  if (outside < width * height * 0.05) return null;
  const peak = bins.indexOf(Math.max(...bins));
  return peak * 8 + 4;
}

type Box = { left: number; right: number; top: number; bottom: number };

/** Tira da caixa os fios de fundo (1-3 px brancos/pretos) que sobram nas bordas do vídeo —
 *  sem isso a moldura fica um pouco maior que o conteúdo e a legenda vaza para dentro. */
function trimBackgroundEdges(box: Box, mean: Float32Array, width: number, height: number): Box {
  const bg = backgroundLuma(mean, width, height, box);
  if (bg === null) return box;
  const isBg = (v: number) => Math.abs(v - bg) <= EDGE_BG_TOLERANCE;
  const rowIsBg = (y: number, l: number, r: number) => {
    let hits = 0;
    for (let x = l; x < r; x += 1) if (isBg(mean[y * width + x])) hits += 1;
    return hits / (r - l) >= EDGE_BG_FRACTION;
  };
  const colIsBg = (x: number, t: number, b: number) => {
    let hits = 0;
    for (let y = t; y < b; y += 1) if (isBg(mean[y * width + x])) hits += 1;
    return hits / (b - t) >= EDGE_BG_FRACTION;
  };

  const maxV = Math.floor(height * EDGE_TRIM_MAX_RATIO);
  const maxH = Math.floor(width * EDGE_TRIM_MAX_RATIO);
  let { left, right, top, bottom } = box;
  for (let i = 0; i < maxV && bottom - top > 8 && rowIsBg(top, left, right); i += 1) top += 1;
  for (let i = 0; i < maxV && bottom - top > 8 && rowIsBg(bottom - 1, left, right); i += 1) bottom -= 1;
  for (let i = 0; i < maxH && right - left > 8 && colIsBg(left, top, bottom); i += 1) left += 1;
  for (let i = 0; i < maxH && right - left > 8 && colIsBg(right - 1, top, bottom); i += 1) right -= 1;
  return { left, right, top, bottom };
}

/** Legenda que troca a cada trecho (texto sobre o fundo do repost) conta como movimento e acaba
 *  dentro da caixa. Linhas coladas no topo/base em que quase tudo é fundo, em TODOS os quadros,
 *  são texto — o vídeo de verdade tem imagem em praticamente toda linha. */
function trimTextBands(box: Box, frames: Uint8Array[], width: number, bg: number): Box {
  const isBg = (v: number) => Math.abs(v - bg) <= EDGE_BG_TOLERANCE;
  const rowIsText = (y: number) => {
    for (const frame of frames) {
      let hits = 0;
      for (let x = box.left; x < box.right; x += 1) if (isBg(frame[y * width + x])) hits += 1;
      if (hits / (box.right - box.left) < TEXT_ROW_BG_FRACTION) return false;
    }
    return true;
  };
  const maxTrim = Math.floor((box.bottom - box.top) * TEXT_TRIM_MAX_RATIO);
  let { top, bottom } = box;
  const limitTop = box.top + maxTrim;
  const limitBottom = box.bottom - maxTrim;
  while (top < limitTop && rowIsText(top)) top += 1;
  while (bottom > limitBottom && bottom > top + 8 && rowIsText(bottom - 1)) bottom -= 1;
  return { ...box, top, bottom };
}

function finalize(box: { left: number; right: number; top: number; bottom: number }, width: number, height: number): Crop {
  const padX = width * PAD_RATIO;
  const padY = height * PAD_RATIO;
  let left = Math.max(0, box.left - padX);
  let right = Math.min(width, box.right + padX);
  let top = Math.max(0, box.top - padY);
  let bottom = Math.min(height, box.bottom + padY);
  // Encosta nas bordas do quadro quando já está quase lá — evita uma faixa residual de 1-2%.
  if (left < width * SNAP_RATIO) left = 0;
  if (width - right < width * SNAP_RATIO) right = width;
  if (top < height * SNAP_RATIO) top = 0;
  if (height - bottom < height * SNAP_RATIO) bottom = height;
  return { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height };
}

/** Fração de pixels que não se mexem entre os quadros. Vídeo em tela cheia tem movimento quase
 *  em todo lugar; repost com cabeçalho/faixas tem muita área parada — serve de pista barata para
 *  decidir se vale uma segunda leitura. */
export function staticPixelRatio(frames: Uint8Array[]): number {
  if (frames.length < 2) return 1;
  const total = frames[0].length;
  let still = 0;
  for (let i = 0; i < total; i += 1) {
    let min = 255;
    let max = 0;
    for (const frame of frames) {
      const value = frame[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min <= MOTION_THRESHOLD) still += 1;
  }
  return still / total;
}

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

const SEAM_WINDOW_TOP: [number, number] = [0.12, 0.38]; // onde a emenda superior pode estar
const SEAM_MIN_STRONG = 6; // pico da emenda mais forte (relativo às linhas vizinhas)
const SEAM_MIN_WEAK = 1.5; // a outra emenda pode ser mais fraca (cena escura/lisa)
const SEAM_SYMMETRY_ROWS = 0.015; // emendas simétricas: topo ≈ 1 - base
const SEAM_MIN_SHARPNESS_GAIN = 1.25; // miolo precisa ser mais nítido que as faixas
const SEAM_MIN_BAND_CHANGE = 1; // (ou, no mínimo, textura nas faixas)
const SEAM_MIN_BAND_TEXTURE = 0.3; // faixas desfocadas mudam com o vídeo; cabeçalho/letterbox estático não

/** Repost "9:16 com fundo desfocado": o vídeo real fica no meio e acima/abaixo vão cópias
 *  ampliadas e borradas dele. As faixas se mexem junto com o vídeo (movimento não as separa) e em
 *  cenas escuras ou lisas a nitidez também não ajuda — mas há sempre uma EMENDA: a variação
 *  vertical entre duas linhas vizinhas dispara exatamente onde o miolo encontra a faixa. As duas
 *  emendas são simétricas (topo ≈ 1 - base), o que permite achar a mais fraca pela mais forte. */
function detectBySeams(frames: Uint8Array[], width: number, height: number) {
  const vertical = new Float32Array(height);
  const horizontal = new Float32Array(height);
  for (const frame of frames) {
    for (let y = 0; y < height; y += 1) {
      let v = 0;
      let h = 0;
      const base = y * width;
      for (let x = 0; x < width; x += 1) {
        if (y > 0) v += Math.abs(frame[base + x] - frame[base - width + x]);
        if (x > 0) h += Math.abs(frame[base + x] - frame[base + x - 1]);
      }
      vertical[y] += v / width / frames.length;
      horizontal[y] += h / width / frames.length;
    }
  }

  const score = (y: number) => {
    let context = 0;
    let count = 0;
    for (let d = 3; d <= 8; d += 1) {
      if (y - d < 1 || y + d >= height) continue;
      context += vertical[y - d] + vertical[y + d];
      count += 2;
    }
    return count === 0 ? 0 : vertical[y] / (context / count + 0.3);
  };

  const from = Math.floor(height * SEAM_WINDOW_TOP[0]);
  const to = Math.floor(height * SEAM_WINDOW_TOP[1]);
  const tolerance = Math.max(1, Math.round(height * SEAM_SYMMETRY_ROWS));
  let best: { top: number; bottom: number; total: number } | null = null;
  for (let top = from; top < to; top += 1) {
    const topScore = score(top);
    if (topScore < SEAM_MIN_WEAK) continue;
    const mirror = height - top;
    for (let bottom = mirror - tolerance; bottom <= mirror + tolerance; bottom += 1) {
      const bottomScore = score(bottom);
      if (bottomScore < SEAM_MIN_WEAK || Math.max(topScore, bottomScore) < SEAM_MIN_STRONG) continue;
      const total = topScore + bottomScore;
      if (!best || total > best.total) best = { top, bottom, total };
    }
  }
  if (!best) return null;

  // Confere que o miolo é mais nítido que as faixas (quando há textura para comparar).
  const mean = (a: number, z: number) => {
    let sum = 0;
    for (let y = a; y < z; y += 1) sum += horizontal[y];
    return sum / Math.max(1, z - a);
  };
  const inside = mean(best.top + 2, best.bottom - 2);
  const outside = (mean(0, best.top - 2) + mean(best.bottom + 2, height)) / 2;
  if (inside > 1 && inside < outside * SEAM_MIN_SHARPNESS_GAIN) return null;

  // Faixas estáticas (cabeçalho, legenda, letterbox) são outro caso — quem trata é o movimento/bordas.
  let change = 0;
  let samples = 0;
  for (let k = 1; k < frames.length; k += 1) {
    for (let y = 0; y < height; y += 1) {
      if (y >= best.top - 2 && y < best.bottom + 2) continue;
      for (let x = 0; x < width; x += 4) {
        change += Math.abs(frames[k][y * width + x] - frames[0][y * width + x]);
        samples += 1;
      }
    }
  }
  if (samples === 0) return null;
  if (change / samples < SEAM_MIN_BAND_CHANGE && outside < SEAM_MIN_BAND_TEXTURE) return null;
  return { left: 0, right: width, top: best.top, bottom: best.bottom };
}

/** `frames`: quadros em luma (width*height bytes cada), de momentos diferentes do vídeo. */
export function detectContentRect(frames: Uint8Array[], width: number, height: number): ContentDetection {
  if (frames.length === 0 || width < 8 || height < 8) return { crop: { ...FULL }, method: "none", confidence: 0 };

  const area = (c: Crop) => c.width * c.height;

  const sharp = frames.length >= 2 ? detectBySeams(frames, width, height) : null;
  if (sharp) {
    const crop = finalize(sharp, width, height);
    if (area(crop) >= MIN_CONTENT_AREA && area(crop) <= MAX_USEFUL_AREA) return { crop, method: "seams", confidence: 0.9 };
  }

  const motion = detectByMotion(frames, width, height);
  if (motion && motion.density >= MIN_MOTION_DENSITY) {
    // O movimento diz ONDE o vídeo está na vertical (cabeçalho/legenda de repost são estáticos),
    // mas em cenas calmas ele fica estreito demais na horizontal: aí vale a largura até as
    // faixas uniformes das laterais (ou o quadro todo, se não houver).
    const sides = trimSideBars(averageFrame(frames, width * height), width, motion.top, motion.bottom);
    const mean = averageFrame(frames, width * height);
    const motionBox = { ...motion, left: sides.left, right: width - sides.right };
    const bg = backgroundLuma(mean, width, height, motionBox);
    const textFree = bg === null ? motionBox : trimTextBands(motionBox, frames, width, bg);
    const refined = trimBackgroundEdges(textFree, mean, width, height);
    const crop = finalize(refined, width, height);
    if (area(crop) >= MIN_CONTENT_AREA && area(crop) <= MAX_USEFUL_AREA) {
      return { crop, method: "motion", confidence: Math.min(1, motion.density * 1.5) };
    }
  }

  const borders = detectByBorders(frames, width, height);
  if (borders) {
    const crop = finalize(borders, width, height);
    if (area(crop) >= MIN_CONTENT_AREA && area(crop) <= MAX_USEFUL_AREA) {
      return { crop, method: "borders", confidence: 0.7 };
    }
  }

  return { crop: { ...FULL }, method: "none", confidence: 0 };
}
