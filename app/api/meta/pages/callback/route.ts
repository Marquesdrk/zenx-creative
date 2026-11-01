import { NextResponse } from "next/server";
import { metaOAuthSessionRepo, metaOAuthStateRepo } from "@/lib/server/meta/db";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchAuthorizingMetaUserId,
} from "@/lib/server/meta/auth";
import { getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import { logMetaApiError, logMetaStep } from "@/lib/server/meta/log";
import { fetchManagedPages } from "@/lib/server/meta/pages";
import { clearOAuthStateCookie, verifyOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

/** Callback dedicado ao app Facebook Pages. Tokens são trocados com as credenciais do app
 *  de Páginas; o app e o callback do Instagram continuam isolados. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedReason = url.searchParams.get("error_description") || url.searchParams.get("error");
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));

  logMetaStep("META_PAGES_OAUTH_CALLBACK", {
    endpoint: "/api/meta/pages/callback",
    metadata: { hasCode: Boolean(code), hasState: Boolean(state), deniedReason },
  });

  if (deniedReason) {
    redirectTo.searchParams.set("meta_error", deniedReason);
    const response = NextResponse.redirect(redirectTo);
    response.headers.append("Set-Cookie", clearOAuthStateCookie("pages"));
    return response;
  }
  if (!code || !state) {
    redirectTo.searchParams.set("meta_error", "Retorno da Meta sem code/state — tente conectar a Página de novo.");
    const response = NextResponse.redirect(redirectTo);
    response.headers.append("Set-Cookie", clearOAuthStateCookie("pages"));
    return response;
  }
  if (!(await metaOAuthStateRepo.consume(state)) && !verifyOAuthStateCookie(request, state, "pages")) {
    redirectTo.searchParams.set("meta_error", "Sessão de login de Páginas expirada ou inválida. Tente conectar de novo.");
    const response = NextResponse.redirect(redirectTo);
    response.headers.append("Set-Cookie", clearOAuthStateCookie("pages"));
    return response;
  }

  try {
    const shortLived = await exchangeCodeForToken(code, { pagesOnly: true });
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken, { pagesOnly: true });
    const metaUserId = await fetchAuthorizingMetaUserId(longLived.accessToken);
    const pages = await fetchManagedPages(longLived.accessToken);
    logMetaStep("META_PAGES_FETCHED", {
      endpoint: "GET /me/accounts",
      metadata: { pageCount: pages.length, metaUserId, isolatedPagesApp: true },
    });

    if (pages.length === 0) {
      redirectTo.searchParams.set(
        "meta_error",
        "Nenhuma Página encontrada para este login. A conta precisa ter acesso suficiente a uma Página."
      );
    } else {
      const sessionId = await metaOAuthSessionRepo.create({ metaUserId, discovered: pages });
      redirectTo.searchParams.set("meta_session", sessionId);
    }
  } catch (err) {
    logMetaApiError(err, { endpoint: "/api/meta/pages/callback", step: "META_PAGES_API_ERROR" });
    const message =
      err instanceof MetaGraphError || err instanceof MetaNetworkError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Falha desconhecida ao conectar a Página do Facebook.";
    redirectTo.searchParams.set("meta_error", message);
  }

  const response = NextResponse.redirect(redirectTo);
  response.headers.append("Set-Cookie", clearOAuthStateCookie("pages"));
  return response;
}
