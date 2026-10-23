import { NextResponse } from "next/server";
import { metaOAuthStateRepo } from "@/lib/server/meta/db";
import { getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { createOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";
import { isSupabaseConfigured } from "@/lib/server/supabase-admin";
import { buildYoutubeAuthorizationUrl, isYoutubeConfigured } from "@/lib/server/youtube/client";

/** Botão "Conectar YouTube" — consentimento Google dedicado (youtube.upload), separado do Drive. */
export async function GET(request: Request) {
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  if (!isYoutubeConfigured()) {
    redirectTo.searchParams.set(
      "meta_error",
      "YouTube não configurado. Defina GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET e YOUTUBE_REDIRECT_URI no .env.local."
    );
    return NextResponse.redirect(redirectTo);
  }
  if (!isSupabaseConfigured()) {
    redirectTo.searchParams.set("meta_error", "Banco de dados não configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).");
    return NextResponse.redirect(redirectTo);
  }

  const state = await metaOAuthStateRepo.create();
  const response = NextResponse.redirect(buildYoutubeAuthorizationUrl(state));
  response.headers.append("Set-Cookie", createOAuthStateCookie(state, "youtube"));
  return response;
}
