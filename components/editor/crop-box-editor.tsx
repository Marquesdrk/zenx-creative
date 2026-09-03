"use client";

import { useState } from "react";
import {
  applyCropDrag,
  effectiveDimensions,
  resolveAspectRatio,
  type CropHandle,
} from "@/lib/editor/crop-geometry";
import type { AspectMode, Crop, Rotation } from "@/lib/editor/types";

const MAX_REF_WIDTH = 300;
const MAX_REF_HEIGHT = 380;
const MIN_CROP_FRACTION = 0.12;

const EDGE_CLASSES: Record<"n" | "s" | "e" | "w", string> = {
  n: "left-0 right-0 top-0 h-3 -translate-y-1/2 cursor-ns-resize",
  s: "left-0 right-0 bottom-0 h-3 translate-y-1/2 cursor-ns-resize",
  w: "left-0 top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize",
  e: "right-0 top-0 bottom-0 w-3 translate-x-1/2 cursor-ew-resize",
};

const CORNER_CLASSES: Record<"nw" | "ne" | "sw" | "se", string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
};

/**
 * Editor visual de recorte: a moldura sobre o vídeo representa exatamente a região usada no
 * resultado final. Arrastar o corpo reposiciona; arrastar bordas/cantos redimensiona. A área
 * fora da moldura recebe overlay escuro (via box-shadow — nunca precisa de 4 retângulos
 * separados). Estado sempre normalizado (0 a 1, relativo à origem já rotacionada) — nunca
 * pixels de tela, então o recorte não muda se o preview for redimensionado.
 */
export function CropBoxEditor({
  contentUrl,
  sourceWidth,
  sourceHeight,
  rotation,
  crop,
  aspectMode,
  targetAspect,
  onChange,
}: {
  contentUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  rotation: Rotation;
  crop: Crop;
  aspectMode: AspectMode;
  targetAspect: number;
  onChange: (crop: Crop) => void;
}) {
  const [activeHandle, setActiveHandle] = useState<CropHandle | null>(null);

  const { width: effWidth, height: effHeight } = effectiveDimensions(
    sourceWidth || 1,
    sourceHeight || 1,
    rotation
  );
  const effAspect = effWidth / effHeight;

  let stageWidth = MAX_REF_WIDTH;
  let stageHeight = stageWidth / effAspect;
  if (stageHeight > MAX_REF_HEIGHT) {
    stageHeight = MAX_REF_HEIGHT;
    stageWidth = stageHeight * effAspect;
  }

  const isSideways = rotation === 90 || rotation === 270;
  const videoWidth = isSideways ? stageHeight : stageWidth;
  const videoHeight = isSideways ? stageWidth : stageHeight;

  const lockedAspect = resolveAspectRatio(aspectMode, effAspect, targetAspect);
  const minSize = Math.min(stageWidth, stageHeight) * MIN_CROP_FRACTION;

  const boxPx = {
    x: crop.x * stageWidth,
    y: crop.y * stageHeight,
    width: crop.width * stageWidth,
    height: crop.height * stageHeight,
  };

  function handleDrag(handle: CropHandle, dx: number, dy: number) {
    const next = applyCropDrag(boxPx, handle, dx, dy, stageWidth, stageHeight, minSize, lockedAspect);
    onChange({
      x: next.x / stageWidth,
      y: next.y / stageHeight,
      width: next.width / stageWidth,
      height: next.height / stageHeight,
    });
  }

  function handlePointerDown(handle: CropHandle) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setActiveHandle(handle);
    };
  }

  function handlePointerMove(handle: CropHandle) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeHandle !== handle) return;
      handleDrag(handle, event.movementX, event.movementY);
    };
  }

  function handlePointerUp() {
    setActiveHandle(null);
  }

  return (
    <div
      data-crop-stage
      style={{ width: stageWidth, height: stageHeight }}
      className="relative mx-auto select-none overflow-hidden rounded-lg bg-black"
    >
      {contentUrl && (
        <video
          src={contentUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) {
              video.currentTime = Math.min(0.1, video.duration / 2);
            }
          }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: videoWidth,
            height: videoHeight,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            objectFit: "cover",
          }}
        />
      )}
      {/* A moldura arrastável. O box-shadow gigante escurece tudo fora dela — a "área
         descartada" do enunciado — sem precisar de 4 retângulos de overlay separados. */}
      <div
        role="button"
        aria-label="Mover recorte"
        data-testid="crop-box"
        onPointerDown={handlePointerDown("move")}
        onPointerMove={handlePointerMove("move")}
        onPointerUp={handlePointerUp}
        style={{
          left: boxPx.x,
          top: boxPx.y,
          width: boxPx.width,
          height: boxPx.height,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
        }}
        className="absolute touch-none cursor-move rounded-sm border-2 border-accent"
      >
        {(Object.keys(EDGE_CLASSES) as Array<keyof typeof EDGE_CLASSES>).map((handle) => (
          <div
            key={handle}
            role="button"
            aria-label={`Redimensionar recorte (${handle})`}
            data-testid={`crop-handle-${handle}`}
            onPointerDown={handlePointerDown(handle)}
            onPointerMove={handlePointerMove(handle)}
            onPointerUp={handlePointerUp}
            className={`absolute touch-none ${EDGE_CLASSES[handle]}`}
          />
        ))}
        {(Object.keys(CORNER_CLASSES) as Array<keyof typeof CORNER_CLASSES>).map((handle) => (
          <div
            key={handle}
            role="button"
            aria-label={`Redimensionar recorte (${handle})`}
            data-testid={`crop-handle-${handle}`}
            onPointerDown={handlePointerDown(handle)}
            onPointerMove={handlePointerMove(handle)}
            onPointerUp={handlePointerUp}
            className={`absolute h-3.5 w-3.5 touch-none rounded-full border-2 border-background bg-accent ${CORNER_CLASSES[handle]}`}
          />
        ))}
      </div>
    </div>
  );
}
