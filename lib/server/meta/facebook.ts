import { GRAPH_BASE } from "./config";
import { graphFetch, graphUrl } from "./graph-client";
import type { MetaIntegrationStep } from "./types";

type StepEvent = (step: MetaIntegrationStep, metadata?: Record<string, unknown>) => void;

type StartReelResponse = { video_id: string; upload_url: string };
type FinishReelResponse = { success?: boolean };
type VideoStatusResponse = {
  status?: {
    video_status?: string;
    uploading_phase?: Record<string, unknown>;
    processing_phase?: Record<string, unknown>;
    publishing_phase?: Record<string, unknown>;
  };
  permalink_url?: string;
  published?: boolean;
};
type PageVideoResponse = { id?: string };

/** Passo 1 do fluxo oficial de Reels em Página (Video API — video_reels): abre a sessão de
 *  upload e recebe o video_id + a URL de upload assinada. */
async function startVideoReelUpload(params: { pageId: string; pageAccessToken: string }): Promise<StartReelResponse> {
  const url = graphUrl(GRAPH_BASE, `${params.pageId}/video_reels`, {});
  return graphFetch<StartReelResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_phase: "start", access_token: params.pageAccessToken }),
  });
}

/** Passo 2: como o vídeo já está hospedado publicamente (PUBLIC_BASE_URL), usa a variante de
 *  upload "por URL" do rupload — a Meta busca o arquivo direto, sem precisar fazer o upload
 *  binário através deste servidor. */
async function transferVideoByUrl(params: { uploadUrl: string; pageAccessToken: string; videoPublicUrl: string }) {
  const res = await fetch(params.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${params.pageAccessToken}`,
      file_url: params.videoPublicUrl,
    },
  });
  const text = await res.text();
  let json: { success?: boolean } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // resposta não-JSON tratada como falha abaixo
  }
  if (!res.ok || !json.success) {
    throw new Error(`Falha ao transferir o vídeo pro Facebook (HTTP ${res.status}).`);
  }
}

/** Passo 3: fecha o upload e publica o Reel — `video_state: "PUBLISHED"` é o que efetivamente
 *  torna o Reel público (sem isso o vídeo fica só como upload não publicado). */
async function finishVideoReel(params: {
  pageId: string;
  pageAccessToken: string;
  videoId: string;
  description: string;
}): Promise<void> {
  const url = graphUrl(GRAPH_BASE, `${params.pageId}/video_reels`, {});
  const data = await graphFetch<FinishReelResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: params.pageAccessToken,
      video_id: params.videoId,
      upload_phase: "finish",
      video_state: "PUBLISHED",
      description: params.description,
    }),
  });
  if (!data.success) {
    throw new Error("A Meta não confirmou a publicação do Reel no Facebook (finish sem success).");
  }
}

/** Checagem opcional pós-publicação (best-effort — não bloqueia o resultado, só informa). */
export async function checkFacebookVideoStatus(videoId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const url = graphUrl(GRAPH_BASE, videoId, { fields: "status", access_token: pageAccessToken });
    const data = await graphFetch<VideoStatusResponse>(url);
    return data.status?.video_status ?? null;
  } catch {
    return null;
  }
}

export type PublishFacebookReelResult = { externalId: string };

/** Publica um vídeo comum no feed da Página. Diferente de /video_reels, este endpoint aceita
 *  vídeos mais longos que o limite de Reels. A Meta busca o MP4 diretamente pela URL assinada. */
export async function publishFacebookPageVideo(params: {
  pageId: string;
  pageAccessToken: string;
  videoUrl: string;
  description: string;
}): Promise<{ externalId: string }> {
  const url = graphUrl(GRAPH_BASE, `${params.pageId}/videos`, {});
  const body = new URLSearchParams({
    access_token: params.pageAccessToken,
    file_url: params.videoUrl,
    description: params.description,
  });
  const data = await graphFetch<PageVideoResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  // O Supabase Cron tem timeout HTTP de 60s; devolva margem para registrar o resultado no banco.
  }, 45_000);
  if (!data.id) throw new Error("A Meta não retornou o ID do vídeo da Página.");
  return { externalId: data.id };
}

/** Confirma o estado de processamento/publicação de um vídeo comum da Página. */
export async function getFacebookPageVideoStatus(videoId: string, pageAccessToken: string): Promise<{
  status: string | null;
  phases: Pick<NonNullable<VideoStatusResponse["status"]>, "uploading_phase" | "processing_phase" | "publishing_phase">;
  permalinkUrl: string | null;
  published: boolean | null;
}> {
  try {
    const url = graphUrl(GRAPH_BASE, videoId, { fields: "status,permalink_url,published", access_token: pageAccessToken });
    const data = await graphFetch<VideoStatusResponse>(url);
    return {
      status: data.status?.video_status ?? null,
      phases: {
        uploading_phase: data.status?.uploading_phase,
        processing_phase: data.status?.processing_phase,
        publishing_phase: data.status?.publishing_phase,
      },
      permalinkUrl: data.permalink_url ?? null,
      published: typeof data.published === "boolean" ? data.published : null,
    };
  } catch {
    return { status: null, phases: {}, permalinkUrl: null, published: null };
  }
}

/** Fluxo completo (start → transfer por URL → finish) parametrizado por Página — cada
 *  publicação usa o Page Access Token daquela conta específica, nunca uma variável global.
 *  `onEvent` (opcional) emite as etapas META_MEDIA_CONTAINER_CREATED/META_MEDIA_PROCESSING pro
 *  logger estruturado do chamador. */
export async function publishFacebookReel(params: {
  pageId: string;
  pageAccessToken: string;
  videoUrl: string;
  caption: string;
  onEvent?: StepEvent;
}): Promise<PublishFacebookReelResult> {
  const { video_id: videoId, upload_url: uploadUrl } = await startVideoReelUpload({
    pageId: params.pageId,
    pageAccessToken: params.pageAccessToken,
  });
  params.onEvent?.("META_MEDIA_CONTAINER_CREATED", { videoId, platform: "FACEBOOK" });

  params.onEvent?.("META_MEDIA_PROCESSING", { videoId });
  await transferVideoByUrl({ uploadUrl, pageAccessToken: params.pageAccessToken, videoPublicUrl: params.videoUrl });

  await finishVideoReel({
    pageId: params.pageId,
    pageAccessToken: params.pageAccessToken,
    videoId,
    description: params.caption,
  });

  return { externalId: videoId };
}
