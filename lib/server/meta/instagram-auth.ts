import { getInstagramAppId, getInstagramAppSecret, getInstagramRedirectUri, INSTAGRAM_GRAPH_BASE } from "./config";
import { graphFetch, graphUrl } from "./graph-client";
import type { GraphOAuthTokenResponse } from "./types";

/** "Instagram API with Instagram Login" (Instagram Business Login) — fluxo oficial da Meta que
 *  conecta uma conta profissional do Instagram DIRETAMENTE, sem exigir Página do Facebook nem
 *  administração dela. É o caminho recomendado quando a conta não tem (ou não precisa ter) uma
 *  Página por trás — o caso comum entre criadores/clientes individuais.
 *  Doc: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 *  Escopos atuais (nomenclatura pós-rebranding "Instagram API"): instagram_business_basic
 *  (perfil/mídia) e instagram_business_content_publish (publicar Reels/posts). */
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

export type ExchangedInstagramToken = { accessToken: string; userId: string; expiresAt: string | null };

/** Passo 1+2: troca `code` por token curto (via api.instagram.com) e já converte pro de longa
 *  duração (~60 dias, via graph.instagram.com/access_token com ig_exchange_token) — mesmo
 *  padrão de dois passos do fluxo de Página, mas em hosts diferentes. */
export async function exchangeInstagramCode(code: string): Promise<ExchangedInstagramToken> {
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

export type InstagramProfile = { id: string; username: string; name: string | null; profilePictureUrl: string | null };

export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
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

/** Renova um token de longa duração ANTES dele expirar (a Meta exige que o token tenha pelo
 *  menos 24h de vida no momento da renovação, e ela precisa acontecer antes dos ~60 dias de
 *  validade — ver docs/META_INTEGRATION_SETUP.md, "Ciclo de vida do token"). Diferente do
 *  fluxo de Página (que não tem refresh, só reautenticação), o Instagram Login tem esse
 *  mecanismo nativo — vale rodar periodicamente (ex.: 1x/semana) pra nunca deixar o token
 *  expirar entre publicações agendadas. */
export async function refreshInstagramToken(currentAccessToken: string): Promise<ExchangedInstagramToken> {
  const url = graphUrl(INSTAGRAM_GRAPH_BASE, "refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: currentAccessToken,
  });
  const data = await graphFetch<GraphOAuthTokenResponse>(url);
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  return { accessToken: data.access_token, userId: "", expiresAt };
}
