import { NextResponse } from "next/server";
import { metaOAuthStateRepo, publicationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import { exchangeInstagramCode, fetchInstagramProfile } from "@/lib/server/meta/instagram-auth";
import { logMetaApiError, logMetaStep } from "@/lib/server/meta/log";
import { clearOAuthStateCookie, verifyOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

/** Callback do "Instagram API with Instagram Login" — ao contrário do fluxo via Página, aqui
 *  não existe etapa de "descoberta" (não há Páginas pra listar): a própria conta autorizada JÁ
 *  é o ativo a conectar, então salvamos direto e voltamos pra tela com sucesso. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedReason = url.searchParams.get("error_description") || url.searchParams.get("error");

  logMetaStep("META_OAUTH_CALLBACK", { endpoint: "/api/meta/instagram/callback", metadata: { hasCode: Boolean(code), flow: "instagram_login" } });

  const finish = (response: NextResponse) => {
    response.headers.append("Set-Cookie", clearOAuthStateCookie("instagram"));
    return response;
  };

  if (deniedReason) {
    redirectTo.searchParams.set("meta_error", deniedReason);
    return finish(NextResponse.redirect(redirectTo));
  }
  if (!code || !state || (!(await metaOAuthStateRepo.consume(state)) && !verifyOAuthStateCookie(request, state, "instagram"))) {
    redirectTo.searchParams.set("meta_error", "Sessão do Instagram expirada ou inválida. Tente conectar novamente.");
    return finish(NextResponse.redirect(redirectTo));
  }

  try {
    const token = await exchangeInstagramCode(code);
    logMetaStep("META_TOKEN_RECEIVED", { endpoint: "POST /oauth/access_token", metadata: { expiresAt: token.expiresAt, flow: "instagram_login" } });

    const profile = await fetchInstagramProfile(token.accessToken);
    if (!profile.id) throw new Error("A Meta não retornou o ID da conta do Instagram.");
    logMetaStep("META_INSTAGRAM_ACCOUNT_FOUND", { metadata: { instagramUserId: profile.id, username: profile.username } });

    const account = await socialAccountsRepo.upsertFromConnection({
      platform: "INSTAGRAM",
      platformAccountId: profile.id,
      pageId: null,
      instagramUserId: profile.id,
      accountName: profile.name || profile.username || "Instagram",
      username: profile.username || null,
      profilePictureUrl: profile.profilePictureUrl,
      accessToken: token.accessToken,
      tokenExpiresAt: token.expiresAt,
      metaUserId: profile.id,
      metadata: { authFlow: "instagram_login" },
    });
    logMetaStep("META_ACCOUNT_SAVED", { socialAccountId: account.id, metadata: { platform: "INSTAGRAM", instagramUserId: profile.id, flow: "instagram_login" } });

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
      metadata: { authFlow: "instagram_login", instagramUserId: profile.id },
    });
    return finish(NextResponse.redirect(redirectTo));
  } catch (err) {
    logMetaApiError(err, { endpoint: "/api/meta/instagram/callback" });
    const message =
      err instanceof MetaGraphError || err instanceof MetaNetworkError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Falha ao conectar o Instagram.";
    redirectTo.searchParams.set("meta_error", message);
    return finish(NextResponse.redirect(redirectTo));
  }
}
