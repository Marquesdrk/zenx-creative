import type { FetchedMetrics, PlatformAdapter, PublishResult } from "./types";

/** Kwai não oferece uma API pública de publicação/self-serve para criadores ou terceiros
 *  no Brasil (diferente de Meta/YouTube/TikTok) — fica registrado só para acompanhamento
 *  manual do que já foi postado direto no app. */
export const kwaiAdapter: PlatformAdapter = {
  name: "Kwai",

  isConfigured() {
    return false;
  },

  async publish(): Promise<PublishResult> {
    throw new Error("Kwai não tem API pública de publicação para terceiros — publique manualmente pelo app.");
  },

  async fetchMetrics(): Promise<FetchedMetrics> {
    return { views: 0, likes: 0, comments: 0, shares: 0 };
  },
};
