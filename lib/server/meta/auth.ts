import {
  GRAPH_BASE,
  OAUTH_DIALOG_URL,
  getMetaAppId,
  getMetaAppSecret,
  getMetaLoginConfigId,
  getMetaPagesAppId,
  getMetaPagesAppSecret,
  getMetaPagesLoginConfigId,
  getMetaPagesRedirectUri,
  getMetaOAuthScopes,
  getMetaRedirectUri,
  isMetaPublishMode,
} from "./config";
import { graphFetch, graphUrl } from "./graph-client";
import type { GraphMeResponse, GraphOAuthTokenResponse } from "./types";

/** Monta a URL do diálogo de login da Meta. `state` é obrigatório e deve ter sido gerado e
 *  guardado por metaOAuthStateRepo.create() — é a única defesa contra CSRF nesse fluxo (ver
 *  app/api/meta/callback/route.ts, que exige metaOAuthStateRepo.consume(state) batendo antes
 *  de trocar o `code` por qualquer token). */
type AuthorizationOptions = {
  forceAccountSelection?: boolean;
  pagesOnly?: boolean;
};

export function buildAuthorizationUrl(state: string, options: AuthorizationOptions = {}): string {
  const url = new URL(OAUTH_DIALOG_URL);
  const appId = options.pagesOnly ? getMetaPagesAppId() : getMetaAppId();
  const redirectUri = options.pagesOnly ? getMetaPagesRedirectUri() : getMetaRedirectUri();
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const configId = options.pagesOnly ? getMetaPagesLoginConfigId() : getMetaLoginConfigId();
  if (configId) {
    url.searchParams.set("config_id", configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", getMetaOAuthScopes().join(","));
  }
  if (options.forceAccountSelection) {
    url.searchParams.set("auth_type", "reauthenticate");
  } else if (isMetaPublishMode()) {
    url.searchParams.set("auth_type", "rerequest");
  }
  return url.toString();
}

export type ExchangedToken = { accessToken: string; expiresAt: string | null };

/** Passo 1 pós-autorização: troca o `code` (de uso único, de curta duração) pelo token de
 *  usuário de curta duração. */
export async function exchangeCodeForToken(code: string, options: { pagesOnly?: boolean } = {}): Promise<ExchangedToken> {
  const url = graphUrl(GRAPH_BASE, "oauth/access_token", {
    client_id: options.pagesOnly ? getMetaPagesAppId() : getMetaAppId(),
    client_secret: options.pagesOnly ? getMetaPagesAppSecret() : getMetaAppSecret(),
    redirect_uri: options.pagesOnly ? getMetaPagesRedirectUri() : getMetaRedirectUri(),
    code,
  });
  const data = await graphFetch<GraphOAuthTokenResponse>(url);
  return toExchangedToken(data);
}

/** Passo 2: troca o token de curta duração (~1-2h) por um de longa duração (~60 dias) — é
 *  esse que vira a base dos Page Access Tokens de longa duração usados pra publicar. */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  options: { pagesOnly?: boolean } = {}
): Promise<ExchangedToken> {
  const url = graphUrl(GRAPH_BASE, "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: options.pagesOnly ? getMetaPagesAppId() : getMetaAppId(),
    client_secret: options.pagesOnly ? getMetaPagesAppSecret() : getMetaAppSecret(),
    fb_exchange_token: shortLivedToken,
  });
  const data = await graphFetch<GraphOAuthTokenResponse>(url);
  return toExchangedToken(data);
}

function toExchangedToken(data: GraphOAuthTokenResponse): ExchangedToken {
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  return { accessToken: data.access_token, expiresAt };
}

/** ID da pessoa que autorizou (usado só pra agrupar contas vindas do mesmo login — não é
 *  armazenado como identidade de usuário do app, já que o sistema é single-tenant). */
export async function fetchAuthorizingMetaUserId(accessToken: string): Promise<string> {
  const url = graphUrl(GRAPH_BASE, "me", { access_token: accessToken, fields: "id" });
  const data = await graphFetch<GraphMeResponse>(url);
  return data.id;
}
