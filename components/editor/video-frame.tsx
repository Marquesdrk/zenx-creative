import { BadgeCheck, User } from "lucide-react";
import type { Profile, WatermarkPosition } from "@/lib/editor/types";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";

function VideoThumbnail({ url, className }: { url: string | null; className: string }) {
  if (url) {
    return <video src={url} muted playsInline preload="metadata" className={`${className} object-cover`} />;
  }
  return <div className={`${className} ${CONTENT_GRADIENT}`} />;
}

export function VideoFrame({
  profile,
  caption,
  contentUrl = null,
  reactionMediaUrl = null,
  watermarkPosition = null,
}: {
  profile: Profile;
  caption: string;
  contentUrl?: string | null;
  /** Só relevante quando profile.template === "react". */
  reactionMediaUrl?: string | null;
  /** Só relevante quando profile.template === "shop-content". */
  watermarkPosition?: WatermarkPosition | null;
}) {
  return (
    <div
      data-testid="video-frame"
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      {profile.template === "react" && (
        <>
          <VideoThumbnail
            url={reactionMediaUrl}
            className="absolute inset-x-0 top-0 h-[36%] border-b border-dashed border-white/20"
          />
          <VideoThumbnail
            url={contentUrl}
            className="absolute inset-x-0 bottom-0 top-[36%]"
          />
        </>
      )}

      {profile.template === "twitter-style" && (
        <div className="flex h-full flex-col items-center bg-black px-2.5 pt-2.5">
          <div className="mb-2 flex w-full items-center gap-1.5">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-5 w-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-700">
                <User size={11} className="text-neutral-400" />
              </div>
            )}
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
          <VideoThumbnail url={contentUrl} className="aspect-[9/13] w-full rounded-lg" />
          <p className="mt-1.5 line-clamp-2 w-full text-[8px] leading-snug text-gray-300">
            {caption}
          </p>
        </div>
      )}

      {profile.template === "shop-content" && (
        <>
          <VideoThumbnail url={contentUrl} className="absolute inset-0" />
          <p className="absolute left-1/2 top-[62%] max-w-[85%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white">
            {caption}
          </p>
          {watermarkPosition && profile.watermarkImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
            <img
              src={profile.watermarkImageUrl}
              alt=""
              data-testid="watermark-badge"
              style={{
                left: `${watermarkPosition.x}%`,
                top: `${watermarkPosition.y}%`,
                transform: `translate(-50%, -50%) scale(${watermarkPosition.scale})`,
                opacity: watermarkPosition.opacity,
              }}
              className="absolute max-h-[20%] max-w-[35%] object-contain"
            />
          )}
        </>
      )}
    </div>
  );
}
