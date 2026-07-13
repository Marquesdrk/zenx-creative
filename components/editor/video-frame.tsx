import { BadgeCheck } from "lucide-react";
import type { EditorTemplate, Profile, ReactionMedia, WatermarkPosition } from "@/lib/editor/types";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";

function ContentPreview({
  contentUrl,
  className,
}: {
  contentUrl: string | null;
  className: string;
}) {
  if (contentUrl) {
    return (
      <video
        src={contentUrl}
        muted
        playsInline
        preload="metadata"
        className={`${className} object-cover`}
      />
    );
  }
  return <div className={`${className} ${CONTENT_GRADIENT}`} />;
}

export function VideoFrame({
  template,
  profile,
  caption,
  contentUrl = null,
  reactionMedia = null,
  watermark = null,
}: {
  template: EditorTemplate;
  profile: Profile;
  caption: string;
  contentUrl?: string | null;
  reactionMedia?: ReactionMedia | null;
  watermark?: WatermarkPosition | null;
}) {
  const reactionColor = reactionMedia?.color ?? profile.avatarColor;

  return (
    <div
      data-testid="video-frame"
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      {template === "react" && (
        <>
          <div
            className="absolute inset-x-0 top-0 flex h-[36%] flex-col items-center justify-center gap-1 border-b border-dashed border-white/20"
            style={{ background: `linear-gradient(160deg, ${reactionColor}33, #1a1a24)` }}
          >
            <div className="h-[22%] w-[22%] rounded-full" style={{ backgroundColor: reactionColor }} />
            {reactionMedia && (
              <span className="px-1 text-center text-[7px] leading-tight text-white/70">
                {reactionMedia.label}
              </span>
            )}
          </div>
          <ContentPreview
            contentUrl={contentUrl}
            className="absolute inset-x-0 bottom-0 top-[36%]"
          />
        </>
      )}

      {template === "twitter-style" && (
        <div className="flex h-full flex-col items-center bg-black px-2.5 pt-2.5">
          <div className="mb-2 flex w-full items-center gap-1.5">
            <div
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: profile.avatarColor }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-0.5">
                <span className="truncate text-[9px] font-bold text-white">{profile.name}</span>
                {profile.verified && (
                  <BadgeCheck size={9} className="shrink-0 text-accent" fill="currentColor" />
                )}
              </div>
              <div className="truncate text-[8px] text-gray-500">{profile.handle}</div>
            </div>
          </div>
          <ContentPreview contentUrl={contentUrl} className="aspect-[9/13] w-full rounded-lg" />
          <p className="mt-1.5 line-clamp-2 w-full text-[8px] leading-snug text-gray-300">
            {caption}
          </p>
        </div>
      )}

      {template === "shop-content" && (
        <>
          <ContentPreview contentUrl={contentUrl} className="absolute inset-0" />
          <p className="absolute left-1/2 top-[62%] max-w-[85%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
            {caption}
          </p>
        </>
      )}

      {watermark && (
        <div
          data-testid="watermark-badge"
          style={{
            left: `${watermark.x}%`,
            top: `${watermark.y}%`,
            transform: `translate(-50%, -50%) scale(${watermark.scale})`,
            opacity: watermark.opacity,
          }}
          className="absolute flex items-center justify-center rounded-md border border-white/30 bg-black/70 px-1.5 py-1 text-[9px] font-bold text-white"
        >
          {profile.watermarkLabel}
        </div>
      )}
    </div>
  );
}
