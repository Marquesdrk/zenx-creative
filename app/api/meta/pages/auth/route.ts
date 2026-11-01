import { NextResponse } from "next/server";
import { metaOAuthStateRepo } from "@/lib/server/meta/db";
import { buildAuthorizationUrl } from "@/lib/server/meta/auth";
import { getMetaDashboardBaseUrl, isMetaPagesConfigured } from "@/lib/server/meta/config";
import { logMetaStep } from "@/lib/server/meta/log";
import { createOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";

/** OAuth de Facebook Pages usa um app e uma configuração independentes do Instagram. */
export async function GET(request: Request) {
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  if (!isMetaPagesConfigured()) {
    redirectTo.searchParams.set(
      "meta_error",
      "Integração de Páginas não configurada. Defina META_PAGES_APP_ID, META_PAGES_APP_SECRET, META_PAGES_REDIRECT_URI e META_PAGES_LOGIN_CONFIG_ID."
    );
    return NextResponse.redirect(redirectTo);
  }
  if (!isSupabaseConfigured()) {
    redirectTo.searchParams.set("meta_error", "Banco de dados não configurado para conectar Páginas.");
    return NextResponse.redirect(redirectTo);
  }

  await metaOAuthStateRepo.cleanupExpired();
  const state = await metaOAuthStateRepo.create();
  const forceAccountSelection = new URL(request.url).searchParams.get("switch_account") === "1";
  logMetaStep("META_PAGES_OAUTH_STARTED", { endpoint: "/api/meta/pages/auth", metadata: { forceAccountSelection } });
  const response = NextResponse.redirect(buildAuthorizationUrl(state, { forceAccountSelection, pagesOnly: true }));
  response.headers.append("Set-Cookie", createOAuthStateCookie(state, "pages"));
  return response;
}
