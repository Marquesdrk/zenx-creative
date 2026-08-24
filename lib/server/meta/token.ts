import { socialAccountsRepo } from "@/lib/server/db";
import { GRAPH_BASE, getMetaAppId, getMetaAppSecret } from "./config";
import { graphFetch, graphUrl, MetaGraphError } from "./graph-client";
import type { GraphDebugTokenResponse } from "./types";

export type TokenCheckResult = { valid: boolean; reason?: string };

/** Verifica se o token guardado de uma conta ainda é válido, usando /debug_token autenticado
 *  com o token de app (app_id|app_secret) — nunca gasta nem expõe o próprio token da conta.
 *  Atualiza social_accounts.status de acordo com o resultado:
 *    - inválido/expirado do lado da Meta → "expired"
 *    - erro de autenticação claro (ex.: revogado) → "revoked"
 *    - válido → "connected"
 *    - erro de rede/temporário → não muda o status (não dá pra saber se é o token) */
export async function checkAccountToken(socialAccountId: string): Promise<TokenCheckResult> {
  const account = socialAccountsRepo.get(socialAccountId);
  if (!account) throw new Error("Conta não encontrada.");
  if (account.status === "revoked") {
    return { valid: false, reason: "Conta desconectada localmente — reconecte para gerar um token novo." };
  }

  const token = socialAccountsRepo.getAccessToken(socialAccountId);
  if (!token) {
    socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: "Token ausente." });
    return { valid: false, reason: "Token ausente." };
  }

  try {
    const appToken = `${getMetaAppId()}|${getMetaAppSecret()}`;
    const url = graphUrl(GRAPH_BASE, "debug_token", { input_token: token, access_token: appToken });
    const data = await graphFetch<GraphDebugTokenResponse>(url);
    const info = data.data;

    if (!info?.is_valid) {
      const reason = info?.error?.message || "Token inválido ou expirado.";
      socialAccountsRepo.updateStatus(socialAccountId, "expired", { lastError: reason });
      return { valid: false, reason };
    }

    socialAccountsRepo.updateStatus(socialAccountId, "connected", { lastError: null });
    return { valid: true };
  } catch (err) {
    if (err instanceof MetaGraphError && err.isAuthError) {
      socialAccountsRepo.updateStatus(socialAccountId, "revoked", { lastError: err.message });
      return { valid: false, reason: err.message };
    }
    const message = err instanceof Error ? err.message : "Falha ao verificar o token (rede/instabilidade da Meta).";
    return { valid: false, reason: message };
  }
}
