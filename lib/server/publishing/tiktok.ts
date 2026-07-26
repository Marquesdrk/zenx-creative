import type { FetchedMetrics, PlatformAdapter, PublishInput, PublishResult } from "./types";

/**
 * TikTok Content Posting API. Diferente de Instagram/Facebook/YouTube, o TikTok exige um
 * app aprovado pela TikTok for Developers e um fluxo de login próprio (OAuth 2.0 + PKCE)
 * para gerar o access token do criador — não implementado aqui (ver .env.local.example).
 * Por segurança, publica como "somente eu" (SELF_ONLY) até você trocar deliberadamente.
 */
export const tiktokAdapter: PlatformAdapter = {
  name: "TikTok",

  isConfigured() {
    return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    if (!token) throw new Error("TikTok não configurado (TIKTOK_ACCESS_TOKEN).");

    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: input.caption, privacy_level: "SELF_ONLY" },
        source_info: { source: "PULL_FROM_URL", video_url: input.videoPublicUrl },
      }),
    });
    const data = (await res.json()) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
    if (!res.ok || data.error?.code !== "ok" || !data.data?.publish_id) {
      throw new Error(data.error?.message ?? "Falha ao publicar no TikTok.");
    }
    return { externalId: data.data.publish_id, permalink: null };
  },

  async fetchMetrics(): Promise<FetchedMetrics> {
    // A Content Posting API não expõe métricas do vídeo publicado; isso vive na Research/
    // Display API, com aprovação separada. Não implementado.
    return { views: 0, likes: 0, comments: 0, shares: 0 };
  },
};
