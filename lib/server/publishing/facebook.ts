import type { FetchedMetrics, PlatformAdapter, PublishInput, PublishResult } from "./types";

const GRAPH_VERSION = "v21.0";

type GraphError = { error?: { message?: string } };

export const facebookAdapter: PlatformAdapter = {
  name: "Facebook",

  isConfigured() {
    return Boolean(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID);
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;
    if (!token || !pageId) throw new Error("Facebook não configurado (META_PAGE_ACCESS_TOKEN / META_PAGE_ID).");

    const res = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${pageId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: input.videoPublicUrl, description: input.caption, access_token: token }),
    });
    const data = (await res.json()) as GraphError & { id?: string };
    if (!res.ok || !data.id) throw new Error(data.error?.message ?? "Falha ao publicar no Facebook.");

    return { externalId: data.id, permalink: null };
  },

  async fetchMetrics(externalId: string): Promise<FetchedMetrics> {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    if (!token) throw new Error("Facebook não configurado.");
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${externalId}?fields=views,likes.summary(true),comments.summary(true)&access_token=${token}`
    );
    const data = (await res.json()) as {
      views?: number;
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    };
    return {
      views: data.views ?? 0,
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      shares: 0,
    };
  },
};
