import { ImageIcon, Sparkles, User } from "lucide-react";
import type { Profile } from "@/lib/editor/types";

export function ProfileAvatar({
  profile,
  className = "h-9 w-9",
}: {
  profile: Profile;
  className?: string;
}) {
  if (profile.engine === "REACT") {
    const url = profile.reactionMedia[0]?.url ?? null;
    if (url) {
      return (
        <video
          src={url}
          muted
          playsInline
          className={`${className} shrink-0 rounded-full object-cover`}
        />
      );
    }
    return (
      <div
        className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-card-hover text-gray-400`}
      >
        <Sparkles size={14} />
      </div>
    );
  }

  if (profile.engine === "X_STYLE") {
    if (profile.avatarUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
        <img
          src={profile.avatarUrl}
          alt=""
          className={`${className} shrink-0 rounded-full object-cover`}
        />
      );
    }
    return (
      <div
        className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-card-hover text-gray-400`}
      >
        <User size={14} />
      </div>
    );
  }

  if (profile.watermarkImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimizable static asset
      <img
        src={profile.watermarkImageUrl}
        alt=""
        className={`${className} shrink-0 rounded-full border border-border bg-black/40 object-contain p-1`}
      />
    );
  }
  return (
    <div
      className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-card-hover text-gray-400`}
    >
      <ImageIcon size={14} />
    </div>
  );
}
