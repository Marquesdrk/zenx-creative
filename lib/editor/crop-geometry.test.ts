import { describe, expect, it } from "vitest";
import {
  applyCropDrag,
  cursorForHandle,
  fitCenteredRect,
  normalizedCropToPixels,
  pixelsToNormalizedCrop,
  resolveAspectRatio,
} from "./crop-geometry";

describe("normalizedCropToPixels", () => {
  it("converts fractions to real pixel dimensions as specified", () => {
    const rect = normalizedCropToPixels({ x: 0.15, y: 0.1, width: 0.7, height: 0.6 }, 1000, 2000);
    expect(rect).toEqual({ x: 150, y: 200, width: 700, height: 1200 });
  });

  it("never produces a zero-size crop even for a degenerate fraction", () => {
    const rect = normalizedCropToPixels({ x: 0, y: 0, width: 0, height: 0 }, 1000, 1000);
    expect(rect.width).toBeGreaterThanOrEqual(2);
    expect(rect.height).toBeGreaterThanOrEqual(2);
  });

  it("clamps a crop that would overflow the source", () => {
    const rect = normalizedCropToPixels({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }, 1000, 1000);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1000);
  });

  it("round-trips with pixelsToNormalizedCrop", () => {
    const crop = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };
    const rect = normalizedCropToPixels(crop, 1920, 1080);
    const back = pixelsToNormalizedCrop(rect, 1920, 1080);
    expect(back.x).toBeCloseTo(crop.x, 2);
    expect(back.y).toBeCloseTo(crop.y, 2);
    expect(back.width).toBeCloseTo(crop.width, 2);
    expect(back.height).toBeCloseTo(crop.height, 2);
  });
});

describe("fitCenteredRect", () => {
  it("at zoom 1, fits the whole content without cropping the dominant axis", () => {
    const rect = fitCenteredRect(1000, 1000, 1, 9 / 16);
    // 1:1 content into a 9:16 target -> height stays full, width is cropped.
    expect(rect.height).toBe(1000);
    expect(rect.width).toBeCloseTo(1000 * (9 / 16), 5);
    expect(rect.x).toBeCloseTo((1000 - rect.width) / 2, 5);
  });

  it("zooming in shrinks the visible window symmetrically around the center", () => {
    const base = fitCenteredRect(1000, 1000, 1, 9 / 16);
    const zoomed = fitCenteredRect(1000, 1000, 2, 9 / 16);
    expect(zoomed.width).toBeCloseTo(base.width / 2, 5);
    expect(zoomed.height).toBeCloseTo(base.height / 2, 5);
    // still centered
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(base.x + base.width / 2, 5);
  });

  it("never exceeds the source dimensions", () => {
    const rect = fitCenteredRect(500, 500, 1, 9 / 16);
    expect(rect.width).toBeLessThanOrEqual(500);
    expect(rect.height).toBeLessThanOrEqual(500);
  });
});

describe("resolveAspectRatio", () => {
  it("returns null for free mode", () => {
    expect(resolveAspectRatio("free", 16 / 9, 9 / 16)).toBeNull();
  });

  it("returns the source aspect for original mode", () => {
    expect(resolveAspectRatio("original", 16 / 9, 9 / 16)).toBeCloseTo(16 / 9);
  });

  it("returns the template's target aspect for template mode", () => {
    expect(resolveAspectRatio("template", 16 / 9, 0.879)).toBeCloseTo(0.879);
  });

  it("returns fixed ratios for the preset modes", () => {
    expect(resolveAspectRatio("9:16", 1, 1)).toBeCloseTo(9 / 16);
    expect(resolveAspectRatio("1:1", 1, 1)).toBe(1);
    expect(resolveAspectRatio("4:5", 1, 1)).toBeCloseTo(4 / 5);
  });
});

describe("applyCropDrag", () => {
  const stageWidth = 300;
  const stageHeight = 500;
  const box = { x: 50, y: 100, width: 100, height: 150 };

  it("moves the whole box by the drag delta", () => {
    const next = applyCropDrag(box, "move", 10, -20, stageWidth, stageHeight, 10, null);
    expect(next).toEqual({ x: 60, y: 80, width: 100, height: 150 });
  });

  it("clamps a move so the box never leaves the stage", () => {
    const next = applyCropDrag(box, "move", 1000, 1000, stageWidth, stageHeight, 10, null);
    expect(next.x).toBe(stageWidth - box.width);
    expect(next.y).toBe(stageHeight - box.height);
  });

  it("dragging the right edge only changes width, in free mode", () => {
    const next = applyCropDrag(box, "e", 30, 0, stageWidth, stageHeight, 10, null);
    expect(next).toEqual({ x: 50, y: 100, width: 130, height: 150 });
  });

  it("dragging the left edge moves x and shrinks width in lockstep", () => {
    const next = applyCropDrag(box, "w", 20, 0, stageWidth, stageHeight, 10, null);
    expect(next.x).toBe(70);
    expect(next.width).toBe(80);
  });

  it("never lets width or height collapse below the minimum", () => {
    const next = applyCropDrag(box, "e", -1000, 0, stageWidth, stageHeight, 10, null);
    expect(next.width).toBe(10);
  });

  it("resizing a corner in free mode changes both dimensions independently", () => {
    const next = applyCropDrag(box, "se", 20, 40, stageWidth, stageHeight, 10, null);
    expect(next).toEqual({ x: 50, y: 100, width: 120, height: 190 });
  });

  it("locked aspect on an edge drag adjusts the perpendicular dimension around the center", () => {
    const lockedAspect = box.width / box.height; // start already at this ratio
    const next = applyCropDrag(box, "e", 20, 0, stageWidth, stageHeight, 10, lockedAspect);
    expect(next.width).toBeCloseTo(120, 5);
    expect(next.height).toBeCloseTo(120 / lockedAspect, 5);
    // vertical center preserved
    const originalCenterY = box.y + box.height / 2;
    expect(next.y + next.height / 2).toBeCloseTo(originalCenterY, 5);
  });

  it("locked aspect on a corner drag keeps the opposite corner anchored", () => {
    const lockedAspect = 1; // square
    const next = applyCropDrag(box, "se", 50, 10, stageWidth, stageHeight, 10, lockedAspect);
    expect(next.x).toBe(box.x);
    expect(next.y).toBe(box.y);
    expect(next.width).toBeCloseTo(next.height, 5);
  });
});

describe("cursorForHandle", () => {
  it("maps each handle to the expected CSS cursor", () => {
    expect(cursorForHandle("move")).toBe("move");
    expect(cursorForHandle("n")).toBe("ns-resize");
    expect(cursorForHandle("s")).toBe("ns-resize");
    expect(cursorForHandle("e")).toBe("ew-resize");
    expect(cursorForHandle("w")).toBe("ew-resize");
    expect(cursorForHandle("nw")).toBe("nwse-resize");
    expect(cursorForHandle("se")).toBe("nwse-resize");
    expect(cursorForHandle("ne")).toBe("nesw-resize");
    expect(cursorForHandle("sw")).toBe("nesw-resize");
  });
});
