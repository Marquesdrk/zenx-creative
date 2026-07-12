import type { EditorTemplate, Profile } from "@/lib/editor/types";

const CONTENT_GRADIENT = "bg-gradient-to-br from-neutral-700 to-neutral-900";

export function VideoFrame({
  template,
  profile,
  caption,
}: {
  template: EditorTemplate;
  profile: Profile;
  caption: string;
}) {
  return (
    <div
      data-testid="video-frame"
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      {template === "react" && (
        <>
          <div
            className="absolute inset-x-0 top-0 flex h-[36%] items-center justify-center border-b border-dashed border-white/20"
            style={{ background: `linear-gradient(160deg, ${profile.avatarColor}33, #1a1a24)` }}
          >
            <div
              className="h-10 w-10 rounded-full"
              style={{ backgroundColor: profile.avatarColor }}
            />
          </div>
          <div className={`absolute inset-x-0 bottom-0 top-[36%] ${CONTENT_GRADIENT}`} />
        </>
      )}

      {template === "twitter-style" && (
        <div className="flex h-full flex-col items-center bg-black px-4 pt-5">
          <div className="mb-2 flex w-full items-center gap-2">
            <div
              className="h-6 w-6 shrink-0 rounded-full"
              style={{ backgroundColor: profile.avatarColor }}
            />
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold text-white">{profile.name}</div>
              <div className="truncate text-[10px] text-gray-500">{profile.handle}</div>
            </div>
          </div>
          <div className={`aspect-[9/13] w-full rounded-lg ${CONTENT_GRADIENT}`} />
          <p className="mt-2 line-clamp-3 w-full text-[10px] leading-snug text-gray-300">
            {caption}
          </p>
        </div>
      )}

      {template === "shop-content" && (
        <>
          <div className={`absolute inset-0 ${CONTENT_GRADIENT}`} />
          <p className="absolute left-1/2 top-[62%] max-w-[85%] -translate-x-1/2 truncate rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">
            {caption}
          </p>
        </>
      )}
    </div>
  );
}
