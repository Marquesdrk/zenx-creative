import { Camera, CircleFadingArrowUp, Music2, Play } from "lucide-react";
import type { Platform } from "@/lib/editor/types";

const PLATFORM_STYLES: Record<string, string> = {
  INSTAGRAM: "bg-pink-500/15 text-pink-400",
  TIKTOK: "bg-cyan-400/15 text-cyan-300",
  FACEBOOK: "bg-blue-500/15 text-blue-400",
  YOUTUBE: "bg-red-500/15 text-red-400",
  KWAI: "bg-orange-500/15 text-orange-300",
};

export function PlatformIcon({ platform, size = "md" }: { platform: Platform | "INSTAGRAM" | "TIKTOK" | "FACEBOOK"; size?: "sm" | "md" }) {
  const className = `${size === "sm" ? "h-6 w-6" : "h-9 w-9"} inline-flex shrink-0 items-center justify-center rounded-full ${
    PLATFORM_STYLES[platform] ?? "bg-white/10 text-white"
  }`;
  const iconSize = size === "sm" ? 13 : 18;
  if (platform === "INSTAGRAM") return <span className={className}><Camera size={iconSize} /></span>;
  if (platform === "FACEBOOK") return <span className={className}><CircleFadingArrowUp size={iconSize} /></span>;
  if (platform === "YOUTUBE") return <span className={className}><Play size={iconSize} /></span>;
  return <span className={className}><Music2 size={iconSize} /></span>;
}
