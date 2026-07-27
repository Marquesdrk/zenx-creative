"use client";

import { useRef, useState } from "react";
import { computeCropRect, effectiveDimensions, rectToCropBoxAndZoom } from "@/lib/editor/crop-geometry";
import type { CropBox, Rotation } from "@/lib/editor/types";

const MAX_REF_WIDTH = 280;
const MAX_REF_HEIGHT = 360;
const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Editor visual de recorte: mostra o quadro inteiro da origem (sem cortar nada) com um
 * retângulo arrastável/redimensionável representando o que vai ser aproveitado — em vez de
 * sliders abstratos de posição/zoom, dá pra ver exatamente o que vai ficar de fora e moldar
 * o recorte com a mão. Usa lib/editor/crop-geometry.ts, a mesma matemática do render real.
 */
export function CropEditor({
  contentUrl,
  sourceWidth,
  sourceHeight,
  rotation,
  targetAspect,
  cropBox,
  cropZoom,
  onChange,
}: {
  contentUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  rotation: Rotation;
  targetAspect: number;
  cropBox: CropBox;
  cropZoom: number;
  onChange: (next: { cropBox: CropBox; zoom: number }) => void;
}) {
  const [mode, setMode] = useState<"move" | "resize" | null>(null);
  const resizeCenterRef = useRef({ x: 0, y: 0 });

  const { width: effWidth, height: effHeight } = effectiveDimensions(
    sourceWidth || 1,
    sourceHeight || 1,
    rotation
  );
  const effAspect = effWidth / effHeight;

  let refWidth = MAX_REF_WIDTH;
  let refHeight = refWidth / effAspect;
  if (refHeight > MAX_REF_HEIGHT) {
    refHeight = MAX_REF_HEIGHT;
    refWidth = refHeight * effAspect;
  }

  const rectPx = computeCropRect(effWidth, effHeight, cropBox, cropZoom, targetAspect);
  const rectFrac = {
    x: rectPx.x / effWidth,
    y: rectPx.y / effHeight,
    width: rectPx.width / effWidth,
    height: rectPx.height / effHeight,
  };

  const isSideways = rotation === 90 || rotation === 270;
  const stageWidth = isSideways ? refHeight : refWidth;
  const stageHeight = isSideways ? refWidth : refHeight;

  function applyRect(nextRectPx: { x: number; y: number; width: number; height: number }) {
    const { cropBox: nextCropBox, zoom: nextZoom } = rectToCropBoxAndZoom(
      nextRectPx,
      effWidth,
      effHeight,
      targetAspect,
      MAX_ZOOM
    );
    onChange({ cropBox: nextCropBox, zoom: nextZoom });
  }

  function handleBodyPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setMode("move");
  }

  function handleBodyPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "move") return;
    const dxEff = (event.movementX / refWidth) * effWidth;
    const dyEff = (event.movementY / refHeight) * effHeight;
    const nextX = clamp(rectPx.x + dxEff, 0, effWidth - rectPx.width);
    const nextY = clamp(rectPx.y + dyEff, 0, effHeight - rectPx.height);
    applyRect({ x: nextX, y: nextY, width: rectPx.width, height: rectPx.height });
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeCenterRef.current = { x: rectPx.x + rectPx.width / 2, y: rectPx.y + rectPx.height / 2 };
    setMode("resize");
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "resize") return;
    const rect = event.currentTarget.closest<HTMLDivElement>("[data-crop-stage]")?.getBoundingClientRect();
    if (!rect) return;
    const center = resizeCenterRef.current;
    const pointerXEff = ((event.clientX - rect.left) / refWidth) * effWidth;
    const pointerYEff = ((event.clientY - rect.top) / refHeight) * effHeight;
    // Redimensiona a partir do centro atual (mesma referência do slider de zoom antigo),
    // mantendo a proporção alvo travada — só o tamanho muda, nunca o formato. Considera as
    // duas distâncias (horizontal e vertical convertida pra escala de largura) e usa a
    // maior, pra um arraste na diagonal responder de forma natural em qualquer ângulo.
    const halfWidthFromX = Math.abs(pointerXEff - center.x);
    const halfWidthFromY = Math.abs(pointerYEff - center.y) * targetAspect;
    const halfWidth = clamp(Math.max(halfWidthFromX, halfWidthFromY), 12, effWidth / 2);
    const width = halfWidth * 2;
    const height = width / targetAspect;
    applyRect({
      x: clamp(center.x - width / 2, 0, Math.max(0, effWidth - width)),
      y: clamp(center.y - height / 2, 0, Math.max(0, effHeight - height)),
      width: Math.min(width, effWidth),
      height: Math.min(height, effHeight),
    });
  }

  function handlePointerUp() {
    setMode(null);
  }

  return (
    <div
      data-crop-stage
      style={{ width: refWidth, height: refHeight }}
      className="relative mx-auto overflow-hidden rounded-lg bg-black"
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
            width: stageWidth,
            height: stageHeight,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            objectFit: "cover",
          }}
        />
      )}
      <div
        role="button"
        aria-label="Mover recorte"
        onPointerDown={handleBodyPointerDown}
        onPointerMove={handleBodyPointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${rectFrac.x * 100}%`,
          top: `${rectFrac.y * 100}%`,
          width: `${rectFrac.width * 100}%`,
          height: `${rectFrac.height * 100}%`,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
        }}
        className="absolute touch-none cursor-move rounded-sm border-2 border-accent"
      >
        <div
          role="button"
          aria-label="Redimensionar recorte"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 touch-none rounded-full border-2 border-background bg-accent"
          style={{ cursor: "nwse-resize" }}
        />
      </div>
    </div>
  );
}
