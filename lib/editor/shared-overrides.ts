import type { ManualOverrides } from "./types";

/** Ajustes que fazem sentido para o lote inteiro. Ficam de fora o que é próprio de cada vídeo:
 *  título (cada vídeo tem o seu), recorte/zoom/rotação/cortes de tempo (dependem das imagens do
 *  arquivo — copiar o recorte de um para todos desfaz o recorte inteligente) e a mídia de reação
 *  escolhida por vídeo. */
const SHARED_KEYS = [
  "caption",
  "xStyleVideoFrame",
  "watermarkPosition",
  "aspectMode",
  "fit",
  "volume",
  "muted",
  "reactionLoopMode",
  "reactOverlay",
] as const satisfies ReadonlyArray<keyof ManualOverrides>;

export type SharedOverrideKey = (typeof SHARED_KEYS)[number];

/** Copia os ajustes compartilhados de `source` para `target`, preservando o que é de cada vídeo.
 *  `only` limita a cópia a alguns campos (ex.: só o texto abaixo do vídeo). */
export function applySharedOverrides(
  target: ManualOverrides,
  source: ManualOverrides,
  only?: ReadonlyArray<SharedOverrideKey>
): ManualOverrides {
  const keys = only ?? SHARED_KEYS;
  const next: ManualOverrides = { ...target };
  for (const key of keys) {
    (next as Record<string, unknown>)[key] = source[key];
  }
  return next;
}
