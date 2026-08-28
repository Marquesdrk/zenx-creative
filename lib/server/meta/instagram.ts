import { GRAPH_BASE } from "./config";
import { graphFetch, graphUrl, MetaGraphError } from "./graph-client";

/** Container criado em /media, ainda não publicado — status_code segue o ciclo descrito na
 *  documentação oficial de "Content Publishing" da Meta. */
type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";

type MediaContainerResponse = { id: string };
type ContainerStatusResponse = { status_code?: ContainerStatus; id?: string };
type MediaPublishResponse = { id: string };

/** Passo 1: cria o container de mídia do Reel a partir de uma URL pública do vídeo. A Meta
 *  baixa o arquivo dessa URL — não aceita localhost, precisa ser HTTPS público (ver
 *  PUBLIC_BASE_URL em .env.local.example). */
export async function createReelContainer(params: {
  instagramUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
  graphBase?: string;
}): Promise<string> {
  const url = graphUrl(params.graphBase ?? GRAPH_BASE, `${params.instagramUserId}/media`, {});
  const data = await graphFetch<MediaContainerResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: params.videoUrl,
      caption: params.caption,
      access_token: params.accessToken,
    }),
  });
  return data.id;
}

async function fetchContainerStatus(containerId: string, accessToken: string, graphBase = GRAPH_BASE): Promise<ContainerStatus> {
  const url = graphUrl(graphBase, containerId, { fields: "status_code", access_token: accessToken });
  const data = await graphFetch<ContainerStatusResponse>(url);
  return data.status_code ?? "ERROR";
}

/** Recomendação oficial: checar status_code cerca de 1x por minuto, no máximo 5 vezes, antes
 *  de considerar que travou. Fica em memória do processo Node (servidor self-hosted de longa
 *  duração) — numa arquitetura serverless isso precisaria virar um job assíncrono real (fila),
 *  ver docs/META_INTEGRATION_SETUP.md. */
export async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  opts: { maxAttempts?: number; intervalMs?: number; graphBase?: string } = {}
): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const intervalMs = opts.intervalMs ?? 60_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await fetchContainerStatus(containerId, accessToken, opts.graphBase);
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR") {
      throw new Error("O Instagram reportou erro ao processar o vídeo do Reel (status ERROR).");
    }
    if (status === "EXPIRED") {
      throw new Error("O container do Reel expirou antes de ser publicado (mais de 24h em processamento).");
    }
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }
  throw new Error(
    `Processamento do vídeo no Instagram não finalizou depois de ${maxAttempts} verificações — tente novamente mais tarde.`
  );
}

/** Passo 2: publica o container já processado (status_code = FINISHED). */
export async function publishReelContainer(params: {
  instagramUserId: string;
  accessToken: string;
  creationId: string;
  graphBase?: string;
}): Promise<string> {
  const url = graphUrl(params.graphBase ?? GRAPH_BASE, `${params.instagramUserId}/media_publish`, {});
  const data = await graphFetch<MediaPublishResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: params.creationId, access_token: params.accessToken }),
  });
  return data.id;
}

export type PublishInstagramReelResult = { externalId: string };

/** Fluxo completo (container → aguardar processamento → publicar), pronto pra ser chamado por
 *  lib/server/meta/publish.ts com o token e o IG User ID de uma conta específica — nunca lê
 *  variável de ambiente global, cada chamada é isolada por conta. */
export async function publishInstagramReel(params: {
  instagramUserId: string;
  accessToken: string;
  videoUrl: string;
  caption: string;
  graphBase?: string;
}): Promise<PublishInstagramReelResult> {
  const graphBase = params.graphBase ?? GRAPH_BASE;
  const containerId = await createReelContainer({ ...params, graphBase });
  try {
    await waitForContainerReady(containerId, params.accessToken, { graphBase });
  } catch (err) {
    // Contexto útil pro log/erro exibido na UI, sem perder a causa original.
    if (err instanceof MetaGraphError) throw err;
    throw new Error(`${err instanceof Error ? err.message : "Falha ao aguardar processamento."} (container ${containerId})`);
  }
  const mediaId = await publishReelContainer({
    instagramUserId: params.instagramUserId,
    accessToken: params.accessToken,
    creationId: containerId,
    graphBase,
  });
  return { externalId: mediaId };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
