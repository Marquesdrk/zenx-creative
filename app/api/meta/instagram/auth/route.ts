import { NextResponse } from "next/server";
import { metaOAuthStateRepo } from "@/lib/server/db";
import { getMetaDashboardBaseUrl, isMetaConfigured } from "@/lib/server/meta/config";
import { buildInstagramAuthorizationUrl } from "@/lib/server/meta/instagram-auth";
import { createOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

export async function GET(request: Request) {
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  if (!isMetaConfigured()) {
    redirectTo.searchParams.set("meta_error", "Integração Meta não configurada no servidor.");
    return NextResponse.redirect(redirectTo);
  }
  const state = metaOAuthStateRepo.create();
  const response = NextResponse.redirect(buildInstagramAuthorizationUrl(state));
  response.headers.append("Set-Cookie", createOAuthStateCookie(state, "instagram"));
  return response;
}
