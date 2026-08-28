import { NextResponse } from "next/server";
import { metaOAuthStateRepo, publicationLogsRepo, socialAccountsRepo } from "@/lib/server/db";
import { getMetaDashboardBaseUrl } from "@/lib/server/meta/config";
import { exchangeInstagramCode, fetchInstagramProfile } from "@/lib/server/meta/instagram-auth";
import { clearOAuthStateCookie, verifyOAuthStateCookie } from "@/lib/server/meta/oauth-state-cookie";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = new URL("/contas-meta", getMetaDashboardBaseUrl(request.url));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error_description") || url.searchParams.get("error");
  const finish = (response: NextResponse) => {
    response.headers.append("Set-Cookie", clearOAuthStateCookie("instagram"));
    return response;
  };

  if (error) {
    redirectTo.searchParams.set("meta_error", error);
    return finish(NextResponse.redirect(redirectTo));
  }
  if (!code || !state || (!metaOAuthStateRepo.consume(state) && !verifyOAuthStateCookie(request, state, "instagram"))) {
    redirectTo.searchParams.set("meta_error", "Sessão do Instagram expirada ou inválida. Tente conectar novamente.");
    return finish(NextResponse.redirect(redirectTo));
  }

  try {
    const token = await exchangeInstagramCode(code);
    const profile = await fetchInstagramProfile(token.accessToken);
    if (!profile.id) throw new Error("A Meta não retornou o ID da conta do Instagram.");
    const account = socialAccountsRepo.upsertFromConnection({
      id: crypto.randomUUID(),
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
    publicationLogsRepo.create({
      userId: null, scheduledPostId: null, socialAccountId: account.id, platform: "INSTAGRAM",
      action: "oauth_connect", status: "success", externalPostId: null, errorCode: null,
      errorMessage: null, metadata: { authFlow: "instagram_login", instagramUserId: profile.id },
    });
    return finish(NextResponse.redirect(redirectTo));
  } catch (err) {
    redirectTo.searchParams.set("meta_error", err instanceof Error ? err.message : "Falha ao conectar o Instagram.");
    return finish(NextResponse.redirect(redirectTo));
  }
}
