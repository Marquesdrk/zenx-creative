import { describe, expect, it } from "vitest";
import { applySharedOverrides } from "./shared-overrides";
import { createDefaultManualOverrides } from "./types";

const base = () => createDefaultManualOverrides({ caption: "", watermarkPosition: { x: 0.5, y: 0.5, scale: 1 } as never, reactionMediaId: null });

describe("applySharedOverrides", () => {
  it("leva o texto abaixo do vídeo mas preserva título e recorte de cada vídeo", () => {
    const source = { ...base(), caption: "Link na bio", title: "Título A", crop: { x: 0, y: 0.3, width: 1, height: 0.4 } };
    const target = { ...base(), caption: "", title: "Título B", crop: { x: 0, y: 0.1, width: 1, height: 0.8 }, zoom: 1.4, trimStart: 2 };
    const result = applySharedOverrides(target, source);
    expect(result.caption).toBe("Link na bio");
    expect(result.title).toBe("Título B");
    expect(result.crop).toEqual({ x: 0, y: 0.1, width: 1, height: 0.8 });
    expect(result.zoom).toBe(1.4);
    expect(result.trimStart).toBe(2);
  });

  it("com `only` copia apenas os campos pedidos", () => {
    const source = { ...base(), caption: "Texto novo", volume: 0.2 };
    const target = { ...base(), caption: "Antigo", volume: 1 };
    const result = applySharedOverrides(target, source, ["caption"]);
    expect(result.caption).toBe("Texto novo");
    expect(result.volume).toBe(1);
  });
});
