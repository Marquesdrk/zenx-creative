import type { Profile, WatermarkPosition } from "./types";

/** Nível 1: padrão global, usado quando o perfil não define o próprio padrão. */
export const GLOBAL_WATERMARK_DEFAULTS: WatermarkPosition = {
  x: 85,
  y: 90,
  scale: 1,
  opacity: 1,
};

/** Nível 2: padrão do perfil substitui o padrão global. */
export function resolveWatermarkDefaults(profile: Profile): WatermarkPosition {
  return profile.watermarkDefaults ?? GLOBAL_WATERMARK_DEFAULTS;
}
