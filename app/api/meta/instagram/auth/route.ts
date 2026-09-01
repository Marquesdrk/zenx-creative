import { NextResponse } from "next/server";
import { metaOAuthStateRepo } from "@/lib/server/meta/db";
import { getMetaDashboardBaseUrl, isInstagramLoginConfigured } from "@/lib/server/meta/config";
import { buildInstagramAuthorizationUrl } from "@/lib/server/meta/instagram-auth";
import { logMetaStep } from "@/lib/server/meta/log";
import { createOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

/** Ponto de entrada do botão "Conectar Instagram" — fluxo "Instagram API with Instagram Login",
 *  que conecta a conta profissional do Instagram diretamente, sem exigir Página do Facebook.
 *  Este é o caminho recomendado para o caso de uso do produto (perfis de Instagram, com ou sem
 *  Página por trás). Ver docs/META_INTEGRATION_SETUP.md, seção 1 e 2. */
export async function GET(request: Request) {
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  if (!isInstagramLoginConfigured()) {
    redirectTo.searchParams.set(
      "meta_error",
      "Integração com a Meta não configurada. Defina META_APP_ID/META_APP_SECRET (ou META_INSTAGRAM_APP_ID/SECRET) no .env.local."
    );
    return NextResponse.redirect(redirectTo);
  }
  if (!isSupabaseConfigured()) {
    redirectTo.searchParams.set(
      "meta_error",
      "Banco de dados não configurado. Defina SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no .env.local e rode supabase/migrations/0001_meta_integration.sql."
    );
    return NextResponse.redirect(redirectTo);
  }

  const state = await metaOAuthStateRepo.create();
  logMetaStep("META_OAUTH_STARTED", { endpoint: "/api/meta/instagram/auth", metadata: { flow: "instagram_login" } });
  const response = NextResponse.redirect(buildInstagramAuthorizationUrl(state));
  response.headers.append("Set-Cookie", createOAuthStateCookie(state, "instagram"));
  return response;
}
