import { socialAccountsRepo } from "@/lib/server/meta/db";
import { GRAPH_BASE, getInstagramAppId, getInstagramAppSecret, getMetaAppId, getMetaAppSecret } from "./config";
import { graphFetch, graphUrl, MetaGraphError } from "./graph-client";
import { logMetaApiError, logMetaStep } from "./log";
import type { GraphDebugTokenResponse } from "./types";

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
  if (account.status === "revoked") {
    return { valid: false, reason: "Conta desconectada localmente — reconecte para gerar um token novo." };
  }

  const token = await socialAccountsRepo.getAccessToken(socialAccountId);
  if (!token) {
    await socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: "Token ausente." });
    return { valid: false, reason: "Token ausente." };
  }

  const endpoint = "GET /debug_token";
  const isInstagramLogin = account.metadata.authFlow === "instagram_login";
  try {
    // Token de conta conectada via "Instagram Login" foi emitido sob o app do Instagram Login
    // (getInstagramAppId/Secret) — pode ser um app dedicado diferente do app principal.
    const appToken = isInstagramLogin
      ? `${getInstagramAppId()}|${getInstagramAppSecret()}`
      : `${getMetaAppId()}|${getMetaAppSecret()}`;
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
      await socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: err.message });
      return { valid: false, reason: err.message };
    }
    const message = err instanceof Error ? err.message : "Falha ao verificar o token (rede/instabilidade da Meta).";
    return { valid: false, reason: message };
  }
}
