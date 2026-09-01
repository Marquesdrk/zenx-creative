import type { FetchedMetrics, PlatformAdapter, PublishInput, PublishResult } from "./types";

const GRAPH_VERSION = "v21.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

type GraphError = { error?: { message?: string } };

export const instagramAdapter: PlatformAdapter = {
  name: "Instagram",

  isConfigured() {
    return Boolean(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_IG_USER_ID);
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const igUserId = process.env.META_IG_USER_ID;
    if (!token || !igUserId) throw new Error("Instagram não configurado (META_PAGE_ACCESS_TOKEN / META_IG_USER_ID).");

    const containerRes = await fetch(`${BASE}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url: input.videoPublicUrl,
        caption: input.caption,
        access_token: token,
      }),
    });
    const container = (await containerRes.json()) as GraphError & { id?: string };
    if (!containerRes.ok || !container.id) {
      throw new Error(container.error?.message ?? "Falha ao criar container de mídia no Instagram.");
    }

    // Vídeos processam de forma assíncrona no lado do Instagram — aguarda até "FINISHED".
    let status = "IN_PROGRESS";
    for (let attempt = 0; attempt < 20 && status === "IN_PROGRESS"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const statusRes = await fetch(`${BASE}/${container.id}?fields=status_code&access_token=${token}`);
      const statusData = (await statusRes.json()) as { status_code?: string };
      status = statusData.status_code ?? "ERROR";
    }
    if (status !== "FINISHED") {
      throw new Error(`Processamento do vídeo no Instagram não finalizou (status: ${status}).`);
    }

    const publishRes = await fetch(`${BASE}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    });
    const published = (await publishRes.json()) as GraphError & { id?: string };
    if (!publishRes.ok || !published.id) {
      throw new Error(published.error?.message ?? "Falha ao publicar mídia no Instagram.");
    }

    return { externalId: published.id, permalink: null };
  },

  async fetchMetrics(externalId: string): Promise<FetchedMetrics> {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) throw new Error("Instagram não configurado.");
    const res = await fetch(
      `${BASE}/${externalId}/insights?metric=plays,likes,comments,shares&access_token=${token}`
    );
    const data = (await res.json()) as { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
    const metric = (name: string) => data.data?.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
    return { views: metric("plays"), likes: metric("likes"), comments: metric("comments"), shares: metric("shares") };
  },
};
