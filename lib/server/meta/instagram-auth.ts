import { getInstagramAppId, getInstagramAppSecret, getInstagramRedirectUri, INSTAGRAM_GRAPH_BASE } from "./config";
import { graphFetch, graphUrl } from "./graph-client";
import type { GraphOAuthTokenResponse } from "./types";

const INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export function buildInstagramAuthorizationUrl(state: string): string {
  const url = new URL(INSTAGRAM_OAUTH_URL);
  url.searchParams.set("client_id", getInstagramAppId());
  url.searchParams.set("redirect_uri", getInstagramRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeInstagramCode(code: string): Promise<{ accessToken: string; userId: string; expiresAt: string | null }> {
  const body = new URLSearchParams({
    client_id: getInstagramAppId(),
    client_secret: getInstagramAppSecret(),
    grant_type: "authorization_code",
    redirect_uri: getInstagramRedirectUri(),
    code,
  });
  const shortLived = await graphFetch<{ access_token: string; user_id: string }>("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const longLivedUrl = graphUrl(INSTAGRAM_GRAPH_BASE, "access_token", {
    grant_type: "ig_exchange_token",
    client_secret: getInstagramAppSecret(),
    access_token: shortLived.access_token,
  });
  const longLived = await graphFetch<GraphOAuthTokenResponse>(longLivedUrl);
  const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000).toISOString() : null;
  return { accessToken: longLived.access_token, userId: shortLived.user_id, expiresAt };
}

export async function fetchInstagramProfile(accessToken: string): Promise<{ id: string; username: string; name: string | null; profilePictureUrl: string | null }> {
  const url = graphUrl(INSTAGRAM_GRAPH_BASE, "me", {
    fields: "user_id,username,name,profile_picture_url",
    access_token: accessToken,
  });
  const profile = await graphFetch<{ user_id?: string; id?: string; username?: string; name?: string; profile_picture_url?: string }>(url);
  return {
    id: profile.user_id || profile.id || "",
    username: profile.username || "",
    name: profile.name || null,
    profilePictureUrl: profile.profile_picture_url || null,
  };
}
