import { deleteDriveFile } from "@/lib/server/google-drive";
import { publicationLogsRepo, scheduledPostAccountsRepo, scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { publishFacebookReel } from "./facebook";
import { MetaGraphError, MetaNetworkError } from "./graph-client";
import { INSTAGRAM_GRAPH_BASE } from "./config";
import {
  createReelContainer,
  getReelContainerStatus,
  publishInstagramReel,
  publishReelContainer,
} from "./instagram";
import { logMetaApiError, logMetaStep } from "./log";
import { resolvePostVideoUrl } from "./video-source";
import type { ScheduledPost, SocialPlatform } from "./types";
import { publishYoutubeShort, YoutubePublishError } from "@/lib/server/youtube/client";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 60_000; // 1min, 2min, 4min, 8min, 16min

function backoffDelayMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** (attempt - 1);
}

type ClassifiedError = { code: string; message: string; recoverable: boolean; isAuthError: boolean };

function classifyError(err: unknown): ClassifiedError {
  if (err instanceof YoutubePublishError) {
    return { code: err.code, message: err.message, recoverable: err.recoverable, isAuthError: err.isAuthError };
  }
  if (err instanceof MetaGraphError) {
    return { code: err.errorCode, message: err.message, recoverable: err.isRecoverable, isAuthError: err.isAuthError };
  }
  if (err instanceof MetaNetworkError) {
    return { code: err.errorCode, message: err.message, recoverable: err.isRecoverable, isAuthError: err.isAuthError };
  }
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Erro desconhecido ao publicar.",
    recoverable: false,
    isAuthError: false,
  };
}

/** Publica 1 destino (uma linha de scheduled_post_accounts) de um vídeo agendado. Sempre
 *  reivindica a linha atomicamente (claim) antes de fazer qualquer chamada de rede — se outra
 *  execução do scheduler já pegou essa linha, não faz nada (evita publicar em duplicidade).
 *  Nunca lança: toda falha vira 'failed' (ou volta pra 'scheduled' com retry agendado, se for
 *  recuperável) + um registro em publication_logs, para que um erro numa conta nunca afete o
 *  processamento das demais contas do mesmo post. */
export async function processScheduledPostAccount(
  scheduledPostAccountId: string,
  options: { deferInstagramProcessing?: boolean } = { deferInstagramProcessing: true },
): Promise<void> {
  const claimed = await scheduledPostAccountsRepo.claim(scheduledPostAccountId);
  if (!claimed) return;

  const spa = await scheduledPostAccountsRepo.get(scheduledPostAccountId);
  if (!spa) return;

  const post = await scheduledPostsRepo.get(spa.scheduledPostId);
  if (!post) {
    await scheduledPostAccountsRepo.updateResult(spa.id, {
      status: "failed",
      errorCode: "POST_NOT_FOUND",
      errorMessage: "Publicação agendada não encontrada.",
      recoverable: false,
    });
    return;
  }

  const account = await socialAccountsRepo.get(spa.socialAccountId);
  if (!account) {
    await finishFailed(spa.id, post.id, null, null, "ACCOUNT_NOT_FOUND", "Conta social não encontrada (pode ter sido excluída).");
    return;
  }
  if (account.status !== "connected") {
    await finishFailed(
      spa.id,
      post.id,
      account.id,
      account.platform,
      "ACCOUNT_NOT_CONNECTED",
      `Conta "${account.accountName}" está com status "${account.status}" — reconecte em Contas Meta antes de publicar.`
    );
    return;
  }

  const accessToken = await socialAccountsRepo.getAccessToken(account.id);
  if (!accessToken) {
    await finishFailed(spa.id, post.id, account.id, account.platform, "NO_TOKEN", "Token de acesso ausente para esta conta.");
    return;
  }

  try {
    // YouTube envia os bytes direto pela API (sem URL pública) — só a Meta precisa da URL.
    const videoUrl = account.platform === "YOUTUBE" ? "" : resolvePostVideoUrl(post);
    const outcome = await publishToAccount({
      post,
      platform: account.platform,
      socialAccountId: account.id,
      accessToken,
      instagramUserId: account.instagramUserId,
      pageId: account.pageId,
      authFlow: typeof account.metadata.authFlow === "string" ? account.metadata.authFlow : undefined,
      videoUrl,
      caption: post.caption,
      coverUrl: post.coverUrl ?? null,
      mediaContainerId: spa.mediaContainerId,
      deferInstagramProcessing: options.deferInstagramProcessing ?? true,
    });

    if (outcome.kind === "waiting") {
      await scheduledPostAccountsRepo.updateResult(spa.id, {
        status: "scheduled",
        mediaContainerId: outcome.mediaContainerId,
        nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
        errorCode: null,
        errorMessage: null,
        recoverable: null,
      });
      await scheduledPostsRepo.syncStatusFromAccounts(post.id);
      return;
    }

    await scheduledPostAccountsRepo.updateResult(spa.id, {
      status: "published",
      mediaContainerId: null,
      externalPostId: outcome.externalId,
      errorCode: null,
      errorMessage: null,
      recoverable: null,
      attemptCount: spa.attemptCount + 1,
      nextAttemptAt: null,
      publishedAt: new Date().toISOString(),
    });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: post.id,
      socialAccountId: account.id,
      platform: account.platform,
      action: "publish_attempt",
      status: "success",
      externalPostId: outcome.externalId,
      errorCode: null,
      errorMessage: null,
      metadata: {},
    });
  } catch (err) {
    const classified = classifyError(err);
    const attemptCount = spa.attemptCount + 1;
    const willRetry = classified.recoverable && attemptCount < MAX_ATTEMPTS;

    await scheduledPostAccountsRepo.updateResult(spa.id, {
      status: willRetry ? "scheduled" : "failed",
      errorCode: classified.code,
      errorMessage: classified.message,
      recoverable: classified.recoverable,
      attemptCount,
      nextAttemptAt: willRetry ? new Date(Date.now() + backoffDelayMs(attemptCount)).toISOString() : null,
    });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: post.id,
      socialAccountId: account.id,
      platform: account.platform,
      action: "publish_attempt",
      status: "failure",
      externalPostId: null,
      errorCode: classified.code,
      errorMessage: classified.message,
      metadata: { attempt: attemptCount, willRetry },
    });
    logMetaApiError(err, { endpoint: "publish", socialAccountId: account.id });

    // Token inválido/expirado/revogado ou permissão removida — marca a conta pra pedir
    // reconexão na tela de Contas Meta. Não mexe em nenhuma outra conta.
    if (classified.isAuthError) {
      await socialAccountsRepo.updateStatus(account.id, "expired", { lastError: classified.message });
    }
  }

  await scheduledPostsRepo.syncStatusFromAccounts(post.id);

  // Só remove o vídeo da pasta de agendados quando TODOS os destinos desse post já
  // publicaram com sucesso — se algum destino ainda falhou/está pendente, mantém o arquivo
  // pra não perder a chance de reagendar/retry manualmente.
  const updatedPost = await scheduledPostsRepo.get(post.id);
  if (updatedPost?.status === "published" && updatedPost.videoSource === "drive" && updatedPost.driveFileId) {
    await deleteDriveFile(updatedPost.driveFileId);
  }
}

async function finishFailed(
  spaId: string,
  postId: string,
  socialAccountId: string | null,
  platform: SocialPlatform | null,
  code: string,
  message: string
) {
  await scheduledPostAccountsRepo.updateResult(spaId, {
    status: "failed",
    errorCode: code,
    errorMessage: message,
    recoverable: false,
  });
  await publicationLogsRepo.create({
    userId: null,
    scheduledPostId: postId,
    socialAccountId,
    platform,
    action: "publish_attempt",
    status: "failure",
    externalPostId: null,
    errorCode: code,
    errorMessage: message,
    metadata: {},
  });
  await scheduledPostsRepo.syncStatusFromAccounts(postId);
}

async function publishToAccount(params: {
  post: ScheduledPost;
  platform: SocialPlatform;
  socialAccountId: string;
  accessToken: string;
  instagramUserId: string | null;
  pageId: string | null;
  authFlow?: string;
  videoUrl: string;
  caption: string;
  coverUrl: string | null;
  mediaContainerId: string | null;
  deferInstagramProcessing: boolean;
}): Promise<{ kind: "waiting"; mediaContainerId: string } | { kind: "published"; externalId: string }> {
  if (params.platform === "YOUTUBE") {
    // accessToken guarda o refresh token do canal (ver supabase/migrations/0008_youtube_accounts.sql).
    const result = await publishYoutubeShort({ refreshToken: params.accessToken, post: params.post });
    return { kind: "published", externalId: result.externalId };
  }
  if (params.platform === "INSTAGRAM") {
    if (!params.instagramUserId) throw new Error("Conta Instagram sem instagram_user_id salvo — reconecte a conta.");
    const graphBase = params.authFlow === "instagram_login" ? INSTAGRAM_GRAPH_BASE : undefined;

    if (params.deferInstagramProcessing) {
      if (!params.mediaContainerId) {
        const mediaContainerId = await createReelContainer({
          instagramUserId: params.instagramUserId,
          accessToken: params.accessToken,
          videoUrl: params.videoUrl,
          caption: params.caption,
          coverUrl: params.coverUrl ?? undefined,
          graphBase,
        });
        logMetaStep("META_MEDIA_CONTAINER_CREATED", {
          socialAccountId: params.socialAccountId,
          metadata: { containerId: mediaContainerId, platform: "INSTAGRAM" },
        });
        return { kind: "waiting", mediaContainerId };
      }

      const container = await getReelContainerStatus(params.mediaContainerId, params.accessToken, graphBase);
      if (container.statusCode === "IN_PROGRESS") {
        logMetaStep("META_MEDIA_PROCESSING", {
          socialAccountId: params.socialAccountId,
          metadata: { containerId: params.mediaContainerId },
        });
        return { kind: "waiting", mediaContainerId: params.mediaContainerId };
      }
      if (container.statusCode === "ERROR") {
        throw new Error(container.status?.trim()
          ? `O Instagram não conseguiu processar o Reel: ${container.status}`
          : "O Instagram reportou erro ao processar o Reel (status ERROR).");
      }
      if (container.statusCode === "EXPIRED") {
        throw new Error("O container do Reel expirou antes de ser publicado (mais de 24h em processamento).");
      }

      const externalId = await publishReelContainer({
        instagramUserId: params.instagramUserId,
        accessToken: params.accessToken,
        creationId: params.mediaContainerId,
        graphBase,
      });
      logMetaStep("META_MEDIA_PUBLISHED", {
        socialAccountId: params.socialAccountId,
        metadata: { mediaId: externalId, platform: "INSTAGRAM" },
      });
      return { kind: "published", externalId };
    }

    const result = await publishInstagramReel({
      instagramUserId: params.instagramUserId,
      accessToken: params.accessToken,
      videoUrl: params.videoUrl,
      caption: params.caption,
      coverUrl: params.coverUrl ?? undefined,
      // Contas conectadas via "Instagram Login" usam tokens do host graph.instagram.com —
      // nunca funcionam contra graph.facebook.com (host das contas conectadas via Página).
      graphBase,
      onEvent: (step, metadata) => logMetaStep(step, { socialAccountId: params.socialAccountId, metadata }),
    });
    logMetaStep("META_MEDIA_PUBLISHED", { socialAccountId: params.socialAccountId, metadata: { mediaId: result.externalId, platform: "INSTAGRAM" } });
    return { kind: "published", externalId: result.externalId };
  }
  if (!params.pageId) throw new Error("Conta Facebook sem page_id salvo — reconecte a conta.");
  const result = await publishFacebookReel({
    pageId: params.pageId,
    pageAccessToken: params.accessToken,
    videoUrl: params.videoUrl,
    caption: params.caption,
    onEvent: (step, metadata) => logMetaStep(step, { socialAccountId: params.socialAccountId, metadata }),
  });
  logMetaStep("META_MEDIA_PUBLISHED", { socialAccountId: params.socialAccountId, metadata: { videoId: result.externalId, platform: "FACEBOOK" } });
  return { kind: "published", externalId: result.externalId };
}

/** Processa todos os destinos ainda pendentes de um post — usado tanto pra "publicar agora"
 *  (disparado sem bloquear a resposta HTTP) quanto reaproveitável por qualquer rotina que
 *  precise varrer um post específico. Cada destino é independente (Promise.allSettled: uma
 *  falha nunca cancela as demais). */
export async function processAllPendingAccountsForPost(scheduledPostId: string): Promise<void> {
  const all = await scheduledPostAccountsRepo.listByPost(scheduledPostId);
  const pending = all.filter((a) => a.status === "scheduled");
  await Promise.allSettled(pending.map((a) => processScheduledPostAccount(a.id, { deferInstagramProcessing: false })));
}
