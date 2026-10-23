import { socialAccountsRepo } from "@/lib/server/meta/db";
import { GRAPH_BASE, getMetaAppId, getMetaAppSecret } from "./config";
import { graphFetch, graphUrl, MetaGraphError } from "./graph-client";
import { logMetaApiError, logMetaStep } from "./log";
import { fetchInstagramProfile } from "./instagram-auth";
import type { GraphDebugTokenResponse } from "./types";
import { checkYoutubeRefreshToken } from "@/lib/server/youtube/client";

export type TokenCheckResult = { valid: boolean; reason?: string; scopes?: string[] };

/** Verifica se o token guardado de uma conta ainda é válido, usando /debug_token autenticado
 *  com o token de app (app_id|app_secret) — nunca gasta nem expõe o próprio token da conta.
 *  Atualiza social_accounts.status de acordo com o resultado:
 *    - inválido/expirado do lado da Meta → "expired"
 *    - erro de autenticação claro (ex.: revogado) → "revoked"
 *    - válido → "connected"
 *    - erro de rede/temporário → não muda o status (não dá pra saber se é o token) */
export async function checkAccountToken(socialAccountId: string): Promise<TokenCheckResult> {
  const account = await socialAccountsRepo.get(socialAccountId);
  if (!account) throw new Error("Conta não encontrada.");

  const token = await socialAccountsRepo.getAccessToken(socialAccountId);
  if (!token) {
    await socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: "Token ausente." });
    return { valid: false, reason: "Token ausente." };
  }

  if (account.platform === "YOUTUBE") {
    const check = await checkYoutubeRefreshToken(token);
    if (check.valid) {
      await socialAccountsRepo.updateStatus(socialAccountId, "connected", { lastError: null });
      return { valid: true, scopes: account.permissions };
    }
    await socialAccountsRepo.updateStatus(socialAccountId, "expired", { lastError: check.reason ?? "Token inválido." });
    return { valid: false, reason: check.reason, scopes: account.permissions };
  }

  const isInstagramLogin = account.metadata.authFlow === "instagram_login";
  const endpoint = isInstagramLogin ? "GET graph.instagram.com/me" : "GET /debug_token";
  try {
    // Tokens do fluxo Instagram Login devem ser verificados no host do Instagram com /me.
    // /debug_token em graph.facebook.com tenta validar o token como um token de app do Facebook;
    // a resposta pode ser OAuthException code 190 mesmo quando o token do Instagram está válido.
    if (isInstagramLogin) {
      const profile = await fetchInstagramProfile(token);
      if (!profile.id || profile.id !== account.instagramUserId) {
        const reason = `O token retornou @${profile.username || "Instagram"}, que não corresponde à conta conectada. Reconecte o perfil correto.`;
        await socialAccountsRepo.updateStatus(socialAccountId, "error", { lastError: reason });
        logMetaStep("META_API_ERROR", { socialAccountId, endpoint, message: reason });
        return { valid: false, reason };
      }

      await socialAccountsRepo.updateStatus(socialAccountId, "connected", { lastError: null });
      logMetaStep("META_CONNECTION_VALIDATED", {
        socialAccountId,
        endpoint,
        metadata: { username: profile.username, authFlow: "instagram_login" },
      });
      return { valid: true, scopes: account.permissions };
    }

    const appToken = `${getMetaAppId()}|${getMetaAppSecret()}`;
    const url = graphUrl(GRAPH_BASE, "debug_token", { input_token: token, access_token: appToken });
    const data = await graphFetch<GraphDebugTokenResponse>(url);
    const info = data.data;
    const scopes = info?.scopes ?? [];

    if (!info?.is_valid) {
      const reason = info?.error?.message || "Token inválido ou expirado.";
      await socialAccountsRepo.updateStatus(socialAccountId, "expired", { lastError: reason, permissions: scopes });
      logMetaStep("META_API_ERROR", { socialAccountId, endpoint, message: reason });
      return { valid: false, reason, scopes };
    }

    await socialAccountsRepo.updateStatus(socialAccountId, "connected", { lastError: null, permissions: scopes });
    logMetaStep("META_CONNECTION_VALIDATED", { socialAccountId, endpoint, metadata: { scopes } });
    return { valid: true, scopes };
  } catch (err) {
    logMetaApiError(err, { endpoint, socialAccountId });
    if (err instanceof MetaGraphError && err.isAuthError) {
      // A resposta "Error validating application" indica um problema ao validar o app
      // (credenciais/configuração da aplicação), não prova que o token desta conta foi
      // revogado. Preserva o status para evitar desconectar em massa contas válidas.
      const isApplicationValidationError =
        /error validating application|cannot get application info/i.test(err.message);
      if (!isApplicationValidationError) {
        await socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: err.message });
      }
      return { valid: false, reason: err.message };
    }
    const message = err instanceof Error ? err.message : "Falha ao verificar o token (rede/instabilidade da Meta).";
    return { valid: false, reason: message };
  }
}
