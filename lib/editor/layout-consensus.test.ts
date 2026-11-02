import { describe, expect, it } from "vitest";
import { consensusCrop, shouldUseConsensus } from "./layout-consensus";
import type { Crop, SourceAnalysis } from "./types";

const base = { width: 576, height: 1024, aspectRatio: 9 / 16, hasLetterboxing: true };
const mid: Crop = { x: 0, y: 0.247, width: 1, height: 0.506 };
const full: Crop = { x: 0, y: 0, width: 1, height: 1 };
const make = (method: SourceAnalysis["detectionMethod"], crop: Crop, extra: Partial<SourceAnalysis> = {}): SourceAnalysis =>
  ({ ...base, suggestedCrop: crop, detectionMethod: method, analysisVersion: 11, ...extra }) as SourceAnalysis;

describe("layout consensus", () => {
  it("usa o recorte confirmado pela maioria", () => {
    const list = [make("seams", mid), make("seams", mid), make("seams", { ...mid, y: 0.25 }), make("none", full)];
    const crop = consensusCrop(list);
    expect(crop?.y).toBeCloseTo(0.248, 2);
    expect(shouldUseConsensus(make("none", full), crop!)).toBe(true);
    expect(shouldUseConsensus(make("seams", { ...mid, y: 0.289, height: 0.42 }), crop!)).toBe(true);
  });

  it("não impõe padrão quando poucos vídeos o confirmam", () => {
    const list = [make("seams", mid), make("none", full), make("none", full), make("borders", full)];
    expect(consensusCrop(list)).toBeNull();
  });

  it("respeita o movimento detectado no próprio vídeo", () => {
    expect(shouldUseConsensus(make("motion", { ...mid, y: 0.1 }), mid)).toBe(false);
  });
});
