import { NextResponse } from "next/server";
import { ensureScheduledVideosFolder } from "@/lib/server/google-drive";
import { metaOAuthSessionRepo, publicationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { logMetaStep } from "@/lib/server/meta/log";
import type { DiscoveredRawPage } from "@/lib/server/meta/pages";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

/** Lista de contas conectadas — socialAccountsRepo.list() nunca inclui o token, então é
 *  seguro devolver direto pro frontend. Devolve [] (em vez de 500) enquanto o Supabase ainda
 *  não estiver configurado, pra tela /contas-meta carregar normalmente antes da configuração. */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json([]);
  return NextResponse.json(await socialAccountsRepo.list());
}

type FinalizeBody = { sessionId: string; selectedKeys: string[] };

/** Passo final do fluxo de conexão: o usuário já viu os ativos descobertos (GET
 *  /api/meta/discover) e escolheu quais quer conectar. Nada é conectado automaticamente antes
 *  disso — é essa rota que efetivamente cria/atualiza as linhas em social_accounts, cada uma
 *  com seu próprio token. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as FinalizeBody | null;
  if (!body?.sessionId || !Array.isArray(body.selectedKeys) || body.selectedKeys.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um ativo para conectar." }, { status: 400 });
  }

  const session = await metaOAuthSessionRepo.get<DiscoveredRawPage[]>(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: "Sessão de descoberta expirada ou inválida. Clique em Conectar Meta de novo." }, { status: 404 });
  }

  const connectedIds: string[] = [];
  const skipped: string[] = [];

  for (const key of body.selectedKeys) {
    const [kind, assetId] = key.split(":", 2);

    if (kind === "page") {
      const page = session.discovered.find((p) => p.pageId === assetId);
      if (!page) {
        skipped.push(key);
        continue;
      }
      const account = await socialAccountsRepo.upsertFromConnection({
        platform: "FACEBOOK",
        platformAccountId: page.pageId,
        pageId: page.pageId,
        instagramUserId: null,
        accountName: page.name,
        username: null,
        profilePictureUrl: page.profilePictureUrl,
        accessToken: page.pageAccessToken,
        // Page Access Tokens derivados de um token de usuário de longa duração não têm data
        // de expiração fixa (permanecem válidos até permissão/senha mudar) — ver
        // docs/META_INTEGRATION_SETUP.md, seção "Ciclo de vida do token".
        tokenExpiresAt: null,
        metaUserId: session.metaUserId,
        metadata: { category: page.category },
      });
      connectedIds.push(account.id);
      logMetaStep("META_ACCOUNT_SAVED", { socialAccountId: account.id, metadata: { platform: "FACEBOOK", pageId: page.pageId } });
      await publicationLogsRepo.create({
        userId: null,
        scheduledPostId: null,
        socialAccountId: account.id,
        platform: "FACEBOOK",
        action: "oauth_connect",
        status: "success",
        externalPostId: null,
        errorCode: null,
        errorMessage: null,
        metadata: { pageId: page.pageId },
      });
      continue;
    }

    if (kind === "instagram") {
      const page = session.discovered.find((p) => p.instagram?.id === assetId);
      if (!page?.instagram) {
        skipped.push(key);
        continue;
      }
      const account = await socialAccountsRepo.upsertFromConnection({
        platform: "INSTAGRAM",
        platformAccountId: page.instagram.id,
        pageId: page.pageId,
        instagramUserId: page.instagram.id,
        accountName: page.instagram.name || page.instagram.username || page.name,
        username: page.instagram.username || null,
        profilePictureUrl: page.instagram.profilePictureUrl,
        // A publicação no Instagram usa o token da Página à qual a conta está vinculada — não
        // existe um token "próprio" separado do Instagram nesse fluxo (Instagram API with
        // Facebook Login).
        accessToken: page.pageAccessToken,
        tokenExpiresAt: null,
        metaUserId: session.metaUserId,
        metadata: { linkedPageId: page.pageId, linkedPageName: page.name },
      });
      connectedIds.push(account.id);
      if (account.username) {
        // Melhor esforço — a conta social conecta normalmente mesmo se o Drive não estiver
        // configurado/conectado ainda; a pasta pode ser criada depois manualmente.
        ensureScheduledVideosFolder(account.username).catch(() => {});
      }
      logMetaStep("META_ACCOUNT_SAVED", { socialAccountId: account.id, metadata: { platform: "INSTAGRAM", instagramUserId: page.instagram.id } });
      await publicationLogsRepo.create({
        userId: null,
        scheduledPostId: null,
        socialAccountId: account.id,
        platform: "INSTAGRAM",
        action: "oauth_connect",
        status: "success",
        externalPostId: null,
        errorCode: null,
        errorMessage: null,
        metadata: { instagramUserId: page.instagram.id },
      });
      continue;
    }

    skipped.push(key);
  }

  // Sessão de descoberta é de uso único — depois de finalizada a seleção, os tokens que
  // estavam nela criptografados deixam de existir ali (só continuam em social_accounts).
  await metaOAuthSessionRepo.remove(body.sessionId);

  return NextResponse.json({ connected: connectedIds.length, skipped, accounts: await socialAccountsRepo.list() });
}
