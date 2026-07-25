"use client";

import { useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { VideoFrame } from "./video-frame";
import type { UgcProfile, WatermarkPosition } from "@/lib/editor/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function WatermarkCanvas({
  profile,
  caption,
  contentUrl = null,
  watermarkPosition,
  onWatermarkPositionChange,
}: {
  profile: UgcProfile;
  caption: string;
  contentUrl?: string | null;
  /** Posição relativa (0 a 1). */
  watermarkPosition: WatermarkPosition;
  onWatermarkPositionChange: (position: WatermarkPosition) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function updateFromPointer(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    onWatermarkPositionChange({ ...watermarkPosition, x, y });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromPointer(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    updateFromPointer(event.clientX, event.clientY);
  }

  function handlePointerUp() {
    setDragging(false);
  }

  const { x, y, scale, opacity } = watermarkPosition;

  return (
    <div ref={containerRef} className="relative select-none">
      <VideoFrame profile={profile} caption={caption} contentUrl={contentUrl} watermarkPosition={null} />
      <div
        role="button"
        aria-label="Arrastar marca d'água"
        data-testid="watermark-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity,
        }}
        className="absolute flex h-10 w-10 cursor-grab items-center justify-center rounded-md border border-white/30 bg-black/70 active:cursor-grabbing"
      >
        {profile.watermarkImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
          <img
            src={profile.watermarkImageUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <ImageOff size={14} className="text-white/60" />
        )}
      </div>
    </div>
  );
}
