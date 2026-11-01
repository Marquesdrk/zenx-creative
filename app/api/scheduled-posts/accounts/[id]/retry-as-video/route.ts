import { NextResponse } from "next/server";
import { metaIntegrationLogsRepo, publicationLogsRepo, scheduledPostAccountsRepo, scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { getFacebookPageVideoStatus, publishFacebookPageVideo } from "@/lib/server/meta/facebook";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import { resolvePostVideoUrl } from "@/lib/server/meta/video-source";

export const maxDuration = 240;

/** Consulta o processamento do vídeo que a Meta aceitou, sem reenviar o arquivo. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = await scheduledPostAccountsRepo.get(id);
  const requestedVideoId = new URL(request.url).searchParams.get("videoId");
  const videoId = requestedVideoId || destination?.externalPostId;
  if (!destination || !videoId || !/^\d+$/.test(videoId)) return NextResponse.json({ error: "ID de vídeo Meta ausente ou inválido." }, { status: 404 });
  const account = await socialAccountsRepo.get(destination.socialAccountId);
  if (!account || account.platform !== "FACEBOOK") return NextResponse.json({ error: "Página do Facebook não encontrada." }, { status: 404 });
  const accessToken = await socialAccountsRepo.getAccessToken(account.id);
  if (!accessToken) return NextResponse.json({ error: "Token de acesso ausente." }, { status: 409 });
  const video = await getFacebookPageVideoStatus(videoId, accessToken);
  return NextResponse.json({ externalPostId: videoId, destinationStatus: destination.status, ...video });
}

/** Tenta novamente um único destino falho como vídeo comum da Página, preservando o arquivo.
 *  Usado quando o conteúdo excede o limite de duração de Reel. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = await scheduledPostAccountsRepo.get(id);
  if (!destination) return NextResponse.json({ error: "Destino não encontrado." }, { status: 404 });
  const retryFailed = destination.status === "failed" && !destination.externalPostId;
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const recoverStale = destination.status === "processing" && !destination.externalPostId && destination.updatedAt < staleBefore;
  if (!retryFailed && !recoverStale) return NextResponse.json({ error: "Destino não falhou ou ainda está ativo; nenhuma nova publicação foi iniciada." }, { status: 409 });

  const post = await scheduledPostsRepo.get(destination.scheduledPostId);
  if (!post) return NextResponse.json({ error: "Publicação agendada não encontrada." }, { status: 404 });
  const account = await socialAccountsRepo.get(destination.socialAccountId);
  if (!account || account.platform !== "FACEBOOK" || !account.pageId) {
    return NextResponse.json({ error: "O destino não é uma Página do Facebook conectada." }, { status: 409 });
  }
  if (account.status !== "connected") return NextResponse.json({ error: "A Página está desconectada; reconecte antes de publicar." }, { status: 409 });
  const accessToken = await socialAccountsRepo.getAccessToken(account.id);
  if (!accessToken) return NextResponse.json({ error: "Token de acesso ausente para esta Página." }, { status: 409 });

  let abandonedReelId: string | null = null;
  if (recoverStale) {
    if (!post.scheduledAt) return NextResponse.json({ error: "Não foi possível correlacionar o upload incompleto com o horário agendado." }, { status: 409 });
    const scheduledMs = Date.parse(post.scheduledAt);
    const steps = await metaIntegrationLogsRepo.listBySocialAccount(account.id, 100);
    const startStep = steps.find((entry) => {
      const timestamp = Date.parse(entry.createdAt);
      return entry.step === "META_MEDIA_CONTAINER_CREATED"
        && timestamp >= scheduledMs - 60_000
        && timestamp <= scheduledMs + 10 * 60_000
        && typeof entry.metadata.videoId === "string"
        && /^\d+$/.test(entry.metadata.videoId);
    });
    if (!startStep || typeof startStep.metadata.videoId !== "string") {
      return NextResponse.json({ error: "Não encontrei o ID do upload Meta incompleto deste agendamento; não vou arriscar duplicar." }, { status: 409 });
    }
    const remote = await getFacebookPageVideoStatus(startStep.metadata.videoId, accessToken);
    const uploading = remote.phases.uploading_phase?.status;
    const processing = remote.phases.processing_phase?.status;
    const publishing = remote.phases.publishing_phase?.status;
    if (remote.status !== "uploading" || uploading !== "in_progress" || processing !== "not_started" || publishing !== "not_started") {
      return NextResponse.json({ error: "A Meta não confirmou um upload parado antes da publicação; o vídeo foi preservado sem reenvio.", metaStatus: remote.status }, { status: 409 });
    }
    abandonedReelId = startStep.metadata.videoId;
  }

  // Em estado processing, só continua se conseguiu reivindicar atomicamente o item parado.
  // Os itens failed usam a transição normal para processing.
  if (recoverStale) {
    const claimed = await scheduledPostAccountsRepo.claimStaleProcessing(id, staleBefore);
    if (!claimed) return NextResponse.json({ error: "Outro worker já está recuperando este vídeo." }, { status: 409 });
  } else {
    await scheduledPostAccountsRepo.updateResult(id, {
      status: "processing",
      errorCode: null,
      errorMessage: null,
      recoverable: null,
    });
  }

  try {
    const result = await publishFacebookPageVideo({
      pageId: account.pageId,
      pageAccessToken: accessToken,
      videoUrl: resolvePostVideoUrl(post),
      description: post.caption,
    });
    const video = await getFacebookPageVideoStatus(result.externalId, accessToken);

    await scheduledPostAccountsRepo.updateResult(id, {
      status: "published",
      externalPostId: result.externalId,
      mediaContainerId: null,
      errorCode: null,
      errorMessage: null,
      recoverable: null,
      attemptCount: destination.attemptCount + 1,
      nextAttemptAt: null,
      publishedAt: new Date().toISOString(),
    });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: post.id,
      socialAccountId: account.id,
      platform: "FACEBOOK",
      action: "publish_attempt",
      status: "success",
      externalPostId: result.externalId,
      errorCode: null,
      errorMessage: null,
      metadata: { publicationFormat: "page_video", videoStatus: video.status },
    });
    await scheduledPostsRepo.syncStatusFromAccounts(post.id);

    return NextResponse.json({ ok: true, externalPostId: result.externalId, recoveredReelId: abandonedReelId, ...video });
  } catch (error) {
    const errorCode = error instanceof MetaGraphError
      ? error.errorCode
      : error instanceof MetaNetworkError
        ? error.errorCode
        : "UNKNOWN";
    const errorMessage = error instanceof Error ? error.message : "Falha ao publicar o vídeo na Página.";
    await scheduledPostAccountsRepo.updateResult(id, {
      status: "failed",
      errorCode,
      errorMessage,
      recoverable: error instanceof MetaGraphError ? error.isRecoverable : error instanceof MetaNetworkError,
      attemptCount: destination.attemptCount + 1,
      nextAttemptAt: null,
    });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: post.id,
      socialAccountId: account.id,
      platform: "FACEBOOK",
      action: "publish_attempt",
      status: "failure",
      externalPostId: null,
      errorCode,
      errorMessage,
      metadata: { publicationFormat: "page_video" },
    });
    await scheduledPostsRepo.syncStatusFromAccounts(post.id);
    return NextResponse.json({ error: errorMessage, errorCode }, { status: 502 });
  }
}
