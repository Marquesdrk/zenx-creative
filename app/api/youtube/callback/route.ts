import { NextResponse } from "next/server";
import { metaOAuthStateRepo, publicationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { clearOAuthStateCookie, verifyOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";
import { exchangeYoutubeCode } from "@/lib/server/youtube/client";

/** Callback do consentimento Google do YouTube: a conta autorizada já É o canal a conectar,
 *  então salvamos direto (como no Instagram Login) e voltamos para Contas conectadas. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const finish = (response: NextResponse) => {
    response.headers.append("Set-Cookie", clearOAuthStateCookie("youtube"));
    return response;
  };

  if (denied) {
    redirectTo.searchParams.set("meta_error", denied === "access_denied" ? "Autorização do YouTube cancelada." : denied);
    return finish(NextResponse.redirect(redirectTo));
  }
  if (!code || !state || (!(await metaOAuthStateRepo.consume(state)) && !verifyOAuthStateCookie(request, state, "youtube"))) {
    redirectTo.searchParams.set("meta_error", "Sessão do YouTube expirada ou inválida. Tente conectar novamente.");
    return finish(NextResponse.redirect(redirectTo));
  }

  try {
    const channel = await exchangeYoutubeCode(code);
    const account = await socialAccountsRepo.upsertFromConnection({
      platform: "YOUTUBE",
      platformAccountId: channel.channelId,
      pageId: null,
      instagramUserId: null,
      accountName: channel.title,
      username: channel.handle,
      profilePictureUrl: channel.thumbnailUrl,
      accessToken: channel.refreshToken,
      tokenExpiresAt: null,
      metaUserId: null,
      permissions: channel.scopes,
      metadata: { authFlow: "google_youtube" },
    });
    await publicationLogsRepo.create({
      userId: null,
      scheduledPostId: null,
      socialAccountId: account.id,
      platform: "YOUTUBE",
      action: "oauth_connect",
      status: "success",
      externalPostId: null,
      errorCode: null,
      errorMessage: null,
      metadata: { channelId: channel.channelId },
    });
    redirectTo.searchParams.set("meta_notice", `Canal do YouTube conectado: ${channel.title}.`);
    return finish(NextResponse.redirect(redirectTo));
  } catch (err) {
    redirectTo.searchParams.set("meta_error", err instanceof Error ? err.message : "Falha ao conectar o YouTube.");
    return finish(NextResponse.redirect(redirectTo));
  }
}
