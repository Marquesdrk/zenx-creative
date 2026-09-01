import type { UgcTemplate, WatermarkPosition } from "./types";

/** Nível 1: padrão global, usado quando o template UGC não define o próprio padrão. */
export const GLOBAL_WATERMARK_DEFAULTS: WatermarkPosition = {
  x: 0.85,
  y: 0.9,
  scale: 1,
  opacity: 1,
};

/** Nível 2: padrão do template substitui o padrão global. */
export function resolveWatermarkDefaults(template: UgcTemplate): WatermarkPosition {
  return template.watermarkDefaults ?? GLOBAL_WATERMARK_DEFAULTS;
}
