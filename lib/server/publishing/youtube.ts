import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { getGoogleAuthClient, isDriveConfigured } from "@/lib/server/google-drive";
import type { FetchedMetrics, PlatformAdapter, PublishInput, PublishResult } from "./types";

/** Reaproveita a mesma conexão Google usada pelo Drive (lib/server/google-drive.ts) — o
 *  escopo youtube.upload já é pedido no mesmo consentimento, com o token persistido no Supabase. */
async function getAuthedClient() {
  if (!isDriveConfigured()) return null;
  return getGoogleAuthClient();
}

export const youtubeAdapter: PlatformAdapter = {
  name: "YouTube",

  isConfigured() {
    return isDriveConfigured();
  },

  async publish(input: PublishInput): Promise<PublishResult> {
    const client = await getAuthedClient();
    if (!client) throw new Error("YouTube não configurado — conecte sua conta Google em Configurações.");
    const youtube = google.youtube({ version: "v3", auth: client });
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: input.caption.slice(0, 90) || "Vídeo", description: input.caption },
        status: { privacyStatus: "public" },
      },
      media: { body: createReadStream(input.videoPath) },
    });
    const id = res.data.id;
    if (!id) throw new Error("YouTube não retornou um ID de vídeo.");
    return { externalId: id, permalink: `https://youtube.com/watch?v=${id}` };
  },

  async fetchMetrics(externalId: string): Promise<FetchedMetrics> {
    const client = await getAuthedClient();
    if (!client) throw new Error("YouTube não configurado.");
    const youtube = google.youtube({ version: "v3", auth: client });
    const res = await youtube.videos.list({ part: ["statistics"], id: [externalId] });
    const stats = res.data.items?.[0]?.statistics;
    return {
      views: Number(stats?.viewCount ?? 0),
      likes: Number(stats?.likeCount ?? 0),
      comments: Number(stats?.commentCount ?? 0),
      shares: 0,
    };
  },
};
