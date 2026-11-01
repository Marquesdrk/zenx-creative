import { describe, expect, it } from "vitest";
import { detectContentRect } from "./content-detection";

const W = 90;
const H = 160;

/** Quadro sintético: fundo `bg`, retângulo [x0,x1)×[y0,y1) com ruído determinístico `seed`. */
function frame(bg: number, rect: { x0: number; x1: number; y0: number; y1: number } | null, seed: number, still = false) {
  const data = new Uint8Array(W * H).fill(bg);
  if (!rect) return data;
  for (let y = rect.y0; y < rect.y1; y += 1) {
    for (let x = rect.x0; x < rect.x1; x += 1) {
      const wave = still ? 128 : 40 + ((x * 7 + y * 13 + seed * 97) % 180);
      data[y * W + x] = wave;
    }
  }
  return data;
}

describe("detectContentRect", () => {
  it("encontra o vídeo em movimento dentro de cabeçalho/rodapé estáticos", () => {
    const rect = { x0: 0, x1: 90, y0: 60, y1: 110 };
    const frames = [0, 1, 2, 3, 4].map((seed) => {
      const f = frame(250, rect, seed);
      // cabeçalho estático com "texto"
      for (let x = 10; x < 70; x += 2) f[15 * W + x] = 20;
      return f;
    });
    const { crop, method } = detectContentRect(frames, W, H);
    expect(method).toBe("motion");
    expect(crop.y).toBeGreaterThan(0.33);
    expect(crop.y).toBeLessThan(0.4);
    expect(crop.y + crop.height).toBeGreaterThan(0.67);
    expect(crop.y + crop.height).toBeLessThan(0.74);
    expect(crop.x).toBe(0);
    expect(crop.width).toBe(1);
  });

  it("recorta barras pretas laterais mesmo com movimento no miolo", () => {
    const rect = { x0: 20, x1: 70, y0: 0, y1: 160 };
    const frames = [0, 1, 2, 3].map((seed) => frame(0, rect, seed));
    const { crop, method } = detectContentRect(frames, W, H);
    expect(method).toBe("motion");
    expect(crop.x).toBeGreaterThan(0.17);
    expect(crop.x).toBeLessThan(0.23);
    expect(crop.width).toBeGreaterThan(0.5);
    expect(crop.width).toBeLessThan(0.6);
    expect(crop.height).toBe(1);
  });

  it("sem movimento usa as bordas uniformes (letterbox estático)", () => {
    const rect = { x0: 0, x1: 90, y0: 40, y1: 120 };
    const frames = [0, 1, 2].map(() => frame(0, rect, 0, true));
    // dá textura ao miolo para não ser considerado "borda uniforme"
    for (const f of frames) for (let y = 40; y < 120; y += 1) for (let x = 0; x < 90; x += 1) f[y * W + x] = 60 + ((x * 3 + y * 5) % 120);
    const { crop, method } = detectContentRect(frames, W, H);
    expect(method).toBe("borders");
    expect(crop.y).toBeGreaterThan(0.22);
    expect(crop.y).toBeLessThan(0.27);
    expect(crop.height).toBeGreaterThan(0.45);
    expect(crop.height).toBeLessThan(0.55);
  });

  it("mantém o quadro inteiro quando o vídeo já ocupa tudo", () => {
    const frames = [0, 1, 2, 3].map((seed) => frame(0, { x0: 0, x1: 90, y0: 0, y1: 160 }, seed));
    const result = detectContentRect(frames, W, H);
    expect(result.method).toBe("none");
    expect(result.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it("ignora um ponto isolado em movimento (ex.: contador no cabeçalho)", () => {
    const rect = { x0: 0, x1: 90, y0: 60, y1: 120 };
    const frames = [0, 1, 2, 3].map((seed) => {
      const f = frame(255, rect, seed);
      for (let y = 5; y < 8; y += 1) for (let x = 5; x < 8; x += 1) f[y * W + x] = seed % 2 ? 0 : 255;
      return f;
    });
    const { crop, method } = detectContentRect(frames, W, H);
    expect(method).toBe("motion");
    expect(crop.y).toBeGreaterThan(0.3);
  });

  it("não deixa a legenda colada no vídeo entrar na moldura nem sobrar fio branco", () => {
    const rect = { x0: 0, x1: 90, y0: 60, y1: 110 };
    const frames = [0, 1, 2, 3, 4].map((seed) => {
      const f = frame(250, rect, seed);
      // legenda estática logo acima do vídeo
      for (let y = 50; y < 59; y += 1) for (let x = 5; x < 80; x += 3) f[y * W + x] = 10;
      // fio claro de 2 linhas dentro das bordas do vídeo (quase fundo, com ruído mínimo)
      for (const y of [60, 61, 108, 109]) for (let x = 0; x < W; x += 1) f[y * W + x] = 244 + (seed % 3);
      return f;
    });
    const { crop } = detectContentRect(frames, W, H);
    expect(crop.y * H).toBeGreaterThanOrEqual(59.5);
    expect((crop.y + crop.height) * H).toBeLessThanOrEqual(110.5);
    expect(crop.y * H).toBeGreaterThanOrEqual(61.5);
    expect((crop.y + crop.height) * H).toBeLessThanOrEqual(108.5);
  });

  it("não quebra com entrada inválida", () => {
    expect(detectContentRect([], W, H).method).toBe("none");
    expect(detectContentRect([new Uint8Array(4)], 2, 2).method).toBe("none");
  });
});
