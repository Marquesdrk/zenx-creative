import { NextResponse } from "next/server";
import { metaOAuthSessionRepo, metaOAuthStateRepo } from "@/lib/server/meta/db";
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchAuthorizingMetaUserId } from "@/lib/server/meta/auth";
import { canDiscoverMetaAssets, getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import { logMetaApiError, logMetaStep } from "@/lib/server/meta/log";
import { fetchManagedPages } from "@/lib/server/meta/pages";
import { clearOAuthStateCookie, verifyOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

/** Callback do OAuth da Meta. Sempre redireciona de volta pra /contas-meta — em caso de
 *  sucesso, com `?meta_session=<id>` (a tela busca os ativos descobertos em
 *  /api/meta/discover e mostra a seleção); em caso de erro, com `?meta_error=<mensagem>`.
 *  Nunca expõe token nenhum na URL de redirecionamento. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedReason = url.searchParams.get("error_description") || url.searchParams.get("error");
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));

  logMetaStep("META_OAUTH_CALLBACK", { endpoint: "/api/meta/callback", metadata: { hasCode: Boolean(code), hasState: Boolean(state), deniedReason } });

  if (deniedReason) {
    redirectTo.searchParams.set("meta_error", deniedReason);
    return NextResponse.redirect(redirectTo);
  }
  if (!code || !state) {
    redirectTo.searchParams.set("meta_error", "Retorno da Meta sem code/state — tente conectar novamente.");
    return NextResponse.redirect(redirectTo);
  }
  // Proteção CSRF: o state precisa existir, não ter expirado (10 min) e só pode ser usado uma
  // vez — consume() já apaga a linha ao validar.
  if (!(await metaOAuthStateRepo.consume(state)) && !verifyOAuthStateCookie(request, state)) {
    redirectTo.searchParams.set("meta_error", "Sessão de login expirada ou inválida. Clique em Conectar Meta de novo.");
    const response = NextResponse.redirect(redirectTo);
    response.headers.append("Set-Cookie", clearOAuthStateCookie());
    return response;
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    logMetaStep("META_TOKEN_RECEIVED", { endpoint: "POST /oauth/access_token", metadata: { expiresAt: longLived.expiresAt } });
    const metaUserId = await fetchAuthorizingMetaUserId(longLived.accessToken);

    if (!canDiscoverMetaAssets()) {
      redirectTo.searchParams.set(
        "meta_notice",
        "Login Meta conectado em modo básico. Para listar Páginas/Instagram e publicar, libere as permissões de Páginas/Instagram na Meta e defina META_OAUTH_SCOPE_MODE=publish."
      );
      return NextResponse.redirect(redirectTo);
    }

    const pages = await fetchManagedPages(longLived.accessToken);
    logMetaStep("META_PAGES_FETCHED", { endpoint: "GET /me/accounts", metadata: { pageCount: pages.length, metaUserId } });
    for (const page of pages) {
      if (page.instagram) {
        logMetaStep("META_INSTAGRAM_ACCOUNT_FOUND", {
          metadata: { instagramUserId: page.instagram.id, username: page.instagram.username, pageId: page.pageId },
        });
      }
    }

    if (pages.length === 0) {
      redirectTo.searchParams.set(
        "meta_error",
        "Nenhuma Página do Facebook encontrada para esse login — é preciso ser administrador de ao menos uma Página."
      );
      return NextResponse.redirect(redirectTo);
    }

    // O token de usuário não precisa ser guardado além desta sessão de descoberta: as
    // publicações usam sempre o Page Access Token de cada Página, não o token de usuário.
    const sessionId = await metaOAuthSessionRepo.create({ metaUserId, discovered: pages });
    redirectTo.searchParams.set("meta_session", sessionId);
  } catch (err) {
    logMetaApiError(err, { endpoint: "/api/meta/callback", step: "META_API_ERROR" });
    const message =
      err instanceof MetaGraphError || err instanceof MetaNetworkError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Falha desconhecida ao conectar com a Meta.";
    redirectTo.searchParams.set("meta_error", message);
  }

  const response = NextResponse.redirect(redirectTo);
  response.headers.append("Set-Cookie", clearOAuthStateCookie());
  return response;
}
