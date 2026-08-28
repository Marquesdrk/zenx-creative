import { NextResponse } from "next/server";
import { metaOAuthStateRepo } from "@/lib/server/db";
import { buildAuthorizationUrl } from "@/lib/server/meta/auth";
import { getMetaDashboardBaseUrl, isMetaConfigured } from "@/lib/server/meta/config";
import { createOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

/** Ponto de entrada do botão "Conectar Meta": identifica que há um pedido de login (o sistema
 *  é single-tenant hoje — ver docs/META_INTEGRATION_SETUP.md — então não há usuário para
 *  autenticar aqui além de quem tem acesso ao servidor), gera um `state` de uso único (defesa
 *  contra CSRF, validado em /api/meta/callback) e redireciona pro diálogo OAuth da Meta. */
export async function GET(request: Request) {
  if (!isMetaConfigured()) {
    const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
    redirectTo.searchParams.set(
      "meta_error",
      "Integração com a Meta não configurada. Defina META_APP_ID, META_APP_SECRET, META_REDIRECT_URI e META_TOKEN_ENCRYPTION_KEY no .env.local."
    );
    return NextResponse.redirect(redirectTo);
  }

  metaOAuthStateRepo.cleanupExpired();
  const state = metaOAuthStateRepo.create();
  const url = new URL(request.url);
  const response = NextResponse.redirect(
    buildAuthorizationUrl(state, { forceAccountSelection: url.searchParams.get("switch_account") === "1" })
  );
  response.headers.append("Set-Cookie", createOAuthStateCookie(state));
  return response;
}
