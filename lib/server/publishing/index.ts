import type { Platform } from "@/lib/editor/types";
import type { PlatformAdapter } from "./types";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";
import { youtubeAdapter } from "./youtube";
import { tiktokAdapter } from "./tiktok";
import { kwaiAdapter } from "./kwai";

export const ADAPTERS: Record<Platform, PlatformAdapter> = {
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
  YOUTUBE: youtubeAdapter,
  TIKTOK: tiktokAdapter,
  KWAI: kwaiAdapter,
};
