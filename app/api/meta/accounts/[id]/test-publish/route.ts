import { NextResponse } from "next/server";
import { publicationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { INSTAGRAM_GRAPH_BASE } from "@/lib/server/meta/config";
import { publishFacebookReel } from "@/lib/server/meta/facebook";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import { publishInstagramReel } from "@/lib/server/meta/instagram";
import { logMetaApiError, logMetaStep } from "@/lib/server/meta/log";

// O polling de status do Reel no Instagram pode levar até 5min (5 tentativas x 60s —
// waitForContainerReady em lib/server/meta/instagram.ts). Em serverless (Vercel), a função
// precisa ficar viva até a resposta ser enviada — isso exige plano Pro+ (maxDuration até 300s
// no Pro; no Hobby o limite é bem menor e essa chamada pode ser encerrada antes de terminar).
export const maxDuration = 300;

type TestPublishBody = { videoUrl: string; caption?: string };

/** Botão "Publicar Reel teste": publica IMEDIATAMENTE nesta única conta, sem passar pela fila
 *  de agendamento (scheduled_posts/scheduled_post_accounts) — por instrução explícita, o
 *  scheduler só entra depois que "conectar → listar → validar → publicar manualmente"
 *  estiver comprovadamente funcionando. Recebe uma URL pública de um MP4, cria o
 *  container/upload, aguarda processamento quando aplicável, publica e devolve o ID da mídia
 *  publicada — o resultado (sucesso ou falha) é sempre salvo em publication_logs. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as TestPublishBody | null;
  if (!body?.videoUrl || !/^https:\/\//.test(body.videoUrl)) {
    return NextResponse.json({ error: "Informe uma URL pública HTTPS de um vídeo MP4." }, { status: 400 });
  }

  const account = await socialAccountsRepo.get(id);
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  if (account.status !== "connected") {
    return NextResponse.json(
      { error: `Conta "${account.accountName}" está com status "${account.status}" — reconecte antes de publicar.` },
      { status: 409 }
    );
  }

  const accessToken = await socialAccountsRepo.getAccessToken(id);
  if (!accessToken) {
    return NextResponse.json({ error: "Token de acesso ausente para esta conta." }, { status: 409 });
  }

  const caption = body.caption ?? "Reel de teste — publicado pelo Zenx Creative.";
  const onEvent = (step: Parameters<typeof logMetaStep>[0], metadata?: Record<string, unknown>) =>
    logMetaStep(step, { socialAccountId: id, metadata });

  try {
    let externalId: string;
    if (account.platform === "INSTAGRAM") {
      if (!account.instagramUserId) throw new Error("Conta Instagram sem instagram_user_id salvo — reconecte a conta.");
      const result = await publishInstagramReel({
        instagramUserId: account.instagramUserId,
        accessToken,
        videoUrl: body.videoUrl,
        caption,
        graphBase: account.metadata.authFlow === "instagram_login" ? INSTAGRAM_GRAPH_BASE : undefined,
        onEvent,
      });
      externalId = result.externalId;
    } else {
      if (!account.pageId) throw new Error("Conta Facebook sem page_id salvo — reconecte a conta.");
      const result = await publishFacebookReel({
        pageId: account.pageId,
        pageAccessToken: accessToken,
        videoUrl: body.videoUrl,
        caption,
        onEvent,
      });
      externalId = result.externalId;
    }

    logMetaStep("META_MEDIA_PUBLISHED", { socialAccountId: id, metadata: { mediaId: externalId, test: true } });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: null,
      socialAccountId: id,
      platform: account.platform,
      action: "publish_attempt",
      status: "success",
      externalPostId: externalId,
      errorCode: null,
      errorMessage: null,
      metadata: { test: true, videoUrl: body.videoUrl },
    });

    return NextResponse.json({ ok: true, mediaId: externalId });
  } catch (err) {
    logMetaApiError(err, { endpoint: "test-publish", socialAccountId: id });
    const classified =
      err instanceof MetaGraphError || err instanceof MetaNetworkError
        ? { code: err.errorCode, message: err.message }
        : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Falha desconhecida ao publicar." };

    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: null,
      socialAccountId: id,
      platform: account.platform,
      action: "publish_attempt",
      status: "failure",
      externalPostId: null,
      errorCode: classified.code,
      errorMessage: classified.message,
      metadata: { test: true, videoUrl: body.videoUrl },
    });

    return NextResponse.json({ error: classified.message, errorCode: classified.code }, { status: 502 });
  }
}
