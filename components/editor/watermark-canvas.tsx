"use client";

import { useRef, useState } from "react";
import { VideoFrame } from "./video-frame";
import type { EditorTemplate, EditorVideo, Profile, ReactionMedia } from "@/lib/editor/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function WatermarkCanvas({
  template,
  profile,
  video,
  reactionMedia = null,
  onWatermarkPositionChange,
}: {
  template: EditorTemplate;
  profile: Profile;
  video: EditorVideo;
  reactionMedia?: ReactionMedia | null;
  onWatermarkPositionChange: (position: EditorVideo["watermarkPosition"]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function updateFromPointer(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
    onWatermarkPositionChange({ ...video.watermarkPosition, x, y });
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

  const { x, y, scale, opacity } = video.watermarkPosition;

  return (
    <div ref={containerRef} className="relative select-none">
      <VideoFrame
        template={template}
        profile={profile}
        caption={video.caption}
        reactionMedia={reactionMedia}
        watermark={null}
      />
      <div
        role="button"
        aria-label="Arrastar marca d'água"
        data-testid="watermark-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity,
        }}
        className="absolute flex h-9 w-9 cursor-grab items-center justify-center rounded-md border border-white/30 bg-black/70 text-[11px] font-bold text-white active:cursor-grabbing"
      >
        {profile.watermarkLabel}
      </div>
    </div>
  );
}
