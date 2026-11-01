import { detectContentRect, staticPixelRatio } from "./content-detection";
import { FULL_FRAME_CROP, SOURCE_ANALYSIS_VERSION, type SourceAnalysis } from "./types";

const NEUTRAL_ANALYSIS: Omit<SourceAnalysis, "width" | "height" | "aspectRatio"> = {
  analysisVersion: SOURCE_ANALYSIS_VERSION,
  hasLetterboxing: false,
  suggestedCrop: { ...FULL_FRAME_CROP },
};

const SAMPLE_COUNT = 5;
/** Só olha os primeiros segundos: buscar (seek) no meio de um vídeo longo em VP9/H.264 força a
 *  decodificação desde o último keyframe e era o que estourava o tempo em lotes grandes. */
const MAX_SAMPLE_SPAN_SECONDS = 30;
/** 1ª leitura, barata (buscas curtas): na maioria dos vídeos já basta e é ~2× mais rápida. */
const FAST_SAMPLE_SPAN_SECONDS = 8;
/** Recorte muito baixo na 1ª leitura costuma ser cena parada nos primeiros segundos (vídeo 0 do
 *  teste: 0,30 contra 0,57 na leitura completa) — vale gastar a 2ª leitura para conferir. */
const SUSPICIOUS_HEIGHT_RATIO = 0.4;
/** Vídeo em tela cheia (quase tudo se mexe) não precisa da 2ª leitura; muita área parada, sim. */
const STATIC_AREA_NEEDS_SECOND_LOOK = 0.5;
const ANALYSIS_MAX_SIDE = 640;
const SEEK_TIMEOUT_MS = 10000;
/** Depois desse orçamento, usa os quadros que já conseguiu em vez de desistir. */
const SAMPLING_BUDGET_MS = 40000;
const HARD_TIMEOUT_MS = SAMPLING_BUDGET_MS + 15000;
/** Decodificar vários vídeos grandes ao mesmo tempo deixa todos lentos demais — a fila garante
 *  que, mesmo com um lote de 200 vídeos, só poucos são analisados juntos (conforme o PC). */
function maxConcurrentAnalyses() {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return Math.min(4, Math.max(2, Math.floor(cores / 3)));
}
const MIN_FRAMES_FOR_DETECTION = 2;
/** Menos que isso = leitura incompleta: o recorte não é confiável e a análise é refeita. */
const MIN_FRAMES_FOR_COMPLETE = 3;
const MAX_ATTEMPTS = 3;
/** Na nova tentativa só olha os primeiros segundos (buscas curtas, quase sempre rápidas). */
const EARLY_SAMPLE_TIMES = [0.4, 1, 1.7, 2.5, 4];

let activeAnalyses = 0;
const waitingAnalyses: Array<() => void> = [];

async function withAnalysisSlot<T>(task: () => Promise<T>, priority = false): Promise<T> {
  if (activeAnalyses >= maxConcurrentAnalyses()) {
    await new Promise<void>((resolve) => (priority ? waitingAnalyses.unshift(resolve) : waitingAnalyses.push(resolve)));
  }
  activeAnalyses += 1;
  try {
    return await task();
  } finally {
    activeAnalyses -= 1;
    waitingAnalyses.shift()?.();
  }
}

function seekTo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => done(false), timeoutMs);
    function done(ok: boolean) {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve(ok);
    }
    function onSeeked() {
      done(true);
    }
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

/** Instantes espalhados pelos primeiros `spanSeconds` do vídeo (ou pelo vídeo todo, se curto). */
export function spreadSampleTimes(duration: number, spanSeconds: number): number[] {
  const span = Math.min(duration, spanSeconds);
  if (!(span > 0)) return [0];
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => Math.min(duration - 0.05, span * (0.08 + (0.84 * i) / (SAMPLE_COUNT - 1))));
}

/** Tira alguns quadros em tempos diferentes (não só do começo — o primeiro quadro costuma ser
 *  preto/fade) e devolve em escala de cinza. Devolve o que conseguiu até o orçamento acabar;
 *  null quando o navegador não decodifica ou o canvas fica "tainted" por CORS. */
export async function sampleLumaFrames(
  video: HTMLVideoElement,
  srcWidth: number,
  srcHeight: number,
  timesOverride?: number[]
) {
  const scale = Math.min(1, ANALYSIS_MAX_SIDE / Math.max(srcWidth, srcHeight));
  const width = Math.max(8, Math.round(srcWidth * scale));
  const height = Math.max(8, Math.round(srcHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const times = timesOverride ?? spreadSampleTimes(duration, MAX_SAMPLE_SPAN_SECONDS);

  const deadline = Date.now() + SAMPLING_BUDGET_MS;
  const frames: Uint8Array[] = [];
  for (const time of times) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 && frames.length >= MIN_FRAMES_FOR_DETECTION) break;
    if (!(await seekTo(video, Math.max(0, time), Math.min(SEEK_TIMEOUT_MS, Math.max(remaining, 2000))))) continue;
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const luma = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
      luma[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }
    frames.push(luma);
  }
  return frames.length > 0 ? { frames, width, height } : null;
}

export function needsCors(url: string) {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return false;
  try {
    return new URL(url, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function analyzeNow(url: string, attempt: number): Promise<SourceAnalysis> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (needsCors(url)) video.crossOrigin = "anonymous";
    let finished = false;

    const finish = (result: SourceAnalysis) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(overall);
      video.removeAttribute("src");
      video.load();
      resolve(result);
    };
    const dimensionsOnly = (width: number, height: number): SourceAnalysis => ({
      width,
      height,
      aspectRatio: width > 0 && height > 0 ? width / height : 9 / 16,
      ...NEUTRAL_ANALYSIS,
      incomplete: true,
    });

    const overall = window.setTimeout(() => finish(dimensionsOnly(video.videoWidth, video.videoHeight)), HARD_TIMEOUT_MS);

    video.addEventListener(
      "loadeddata",
      () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return finish(dimensionsOnly(0, 0));
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const firstTimes =
          attempt > 0
            ? EARLY_SAMPLE_TIMES.map((t) => Math.min(t, Math.max(0, (video.duration || t) - 0.1)))
            : spreadSampleTimes(duration, FAST_SAMPLE_SPAN_SECONDS);
        sampleLumaFrames(video, width, height, firstTimes)
          .then(async (sampled) => {
            if (!sampled || sampled.frames.length < MIN_FRAMES_FOR_DETECTION) return finish(dimensionsOnly(width, height));
            let detection = detectContentRect(sampled.frames, sampled.width, sampled.height);
            // "borders" na 1ª leitura pode ser só a abertura escura do vídeo; "motion" pequeno pode ser
            // cena parada; "none" com muita área parada pode esconder um cabeçalho. Vídeo em tela
            // cheia e com movimento em tudo já está resolvido — poupa a 2ª leitura (~35% do tempo).
            const suspicious =
              detection.method === "borders" ||
              (detection.method === "motion" && detection.crop.height < SUSPICIOUS_HEIGHT_RATIO) ||
              (detection.method === "none" && staticPixelRatio(sampled.frames) > STATIC_AREA_NEEDS_SECOND_LOOK);
            if (attempt === 0 && suspicious && duration > FAST_SAMPLE_SPAN_SECONDS) {
              const wider = await sampleLumaFrames(video, width, height, spreadSampleTimes(duration, MAX_SAMPLE_SPAN_SECONDS));
              if (wider) {
                sampled.frames.push(...wider.frames);
                detection = detectContentRect(sampled.frames, sampled.width, sampled.height);
              }
            }
            finish({
              ...dimensionsOnly(width, height),
              hasLetterboxing: detection.method !== "none",
              suggestedCrop: detection.crop,
              incomplete: sampled.frames.length < MIN_FRAMES_FOR_COMPLETE,
            });
          })
          .catch(() => finish(dimensionsOnly(width, height)));
      },
      { once: true }
    );
    video.addEventListener("error", () => finish(dimensionsOnly(0, 0)), { once: true });
    video.src = url;
  });
}

/** Só as dimensões do arquivo (sem decodificar quadros): ~0,1 s por vídeo. Usado quando o lote é
 *  importado com o recorte inteligente desligado — o editor precisa da proporção real do arquivo. */
export function readVideoDimensions(url: string): Promise<SourceAnalysis> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    if (needsCors(url)) video.crossOrigin = "anonymous";
    const finish = (width: number, height: number) => {
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve({
        width,
        height,
        aspectRatio: width > 0 && height > 0 ? width / height : 9 / 16,
        ...NEUTRAL_ANALYSIS,
        incomplete: false,
      });
    };
    const timer = window.setTimeout(() => finish(video.videoWidth, video.videoHeight), 15000);
    video.addEventListener("loadedmetadata", () => finish(video.videoWidth, video.videoHeight), { once: true });
    video.addEventListener("error", () => finish(0, 0), { once: true });
    video.src = url;
  });
}

/** Lê as dimensões do arquivo e sugere o recorte do conteúdo real (cabeçalhos/legendas de
 *  repost, faixas e barras em volta) — ver lib/editor/content-detection.ts. Nunca rejeita:
 *  se não der pra analisar, devolve o quadro inteiro e o usuário ajusta manualmente.
 *  Chamadas simultâneas entram numa fila (MAX_CONCURRENT_ANALYSES). */
export async function analyzeVideoSource(
  url: string,
  options: { /** Passa na frente da fila (ex.: vídeo aberto no editor). */ priority?: boolean } = {}
): Promise<SourceAnalysis> {
  let last: SourceAnalysis | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    last = await withAnalysisSlot(() => analyzeNow(url, attempt), options.priority);
    if (!last.incomplete) return last;
    if (attempt >= 1 && last.width === 0) break; // arquivo ilegível: insistir só gasta fila
    await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
  }
  return last as SourceAnalysis;
}
