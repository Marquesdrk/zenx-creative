import { metaIntegrationLogsRepo } from "@/lib/server/meta/db";
import { MetaGraphError, MetaNetworkError } from "@/lib/server/meta/graph-client";
import type { MetaIntegrationStep } from "@/lib/server/meta/types";

/** Logger estruturado da integração Meta — chame em cada etapa do fluxo (ver
 *  MetaIntegrationStep em types.ts) em vez de `console.error` genérico. Sempre imprime um JSON
 *  de uma linha (fácil de grepar/agregar em qualquer coletor de logs) e também persiste em
 *  meta_integration_logs para a tela de diagnóstico — nunca inclui token/access_token. Nunca
 *  lança: uma falha ao gravar o log não pode derrubar o fluxo que está sendo logado. */
export type MetaLogFields = {
  socialAccountId?: string | null;
  endpoint?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export function logMetaStep(step: MetaIntegrationStep, fields: MetaLogFields = {}): void {
  const line = {
    scope: "meta_integration",
    step,
    endpoint: fields.endpoint ?? null,
    socialAccountId: fields.socialAccountId ?? null,
    message: fields.message ?? null,
    metadata: fields.metadata ?? {},
    at: new Date().toISOString(),
  };
  console.log(JSON.stringify(line));

  void metaIntegrationLogsRepo
    .create({
      step,
      socialAccountId: fields.socialAccountId ?? null,
      endpoint: fields.endpoint ?? null,
      message: fields.message ?? null,
      metadata: fields.metadata ?? {},
    })
    .catch((err) => {
      console.error("Falha ao persistir meta_integration_logs:", err instanceof Error ? err.message : err);
    });
}

/** Variante para META_API_ERROR — extrai endpoint/http_status/error_code/subcode/fbtrace_id de
 *  um MetaGraphError/MetaNetworkError automaticamente, no formato exato pedido pro diagnóstico:
 *  endpoint, etapa, status HTTP, error code, error subcode, mensagem, fbtrace_id. */
export function logMetaApiError(
  err: unknown,
  fields: { endpoint: string; socialAccountId?: string | null; step?: MetaIntegrationStep } = { endpoint: "unknown" }
): void {
  const step = fields.step ?? "META_API_ERROR";
  const base = {
    scope: "meta_integration",
    step,
    endpoint: fields.endpoint,
    socialAccountId: fields.socialAccountId ?? null,
    at: new Date().toISOString(),
  };

  if (err instanceof MetaGraphError) {
    const line = {
      ...base,
      httpStatus: err.httpStatus,
      metaErrorCode: err.code,
      metaErrorSubcode: err.subcode,
      message: err.message,
      fbtraceId: err.fbtraceId,
    };
    console.error(JSON.stringify(line));
    void metaIntegrationLogsRepo
      .create({
        step,
        socialAccountId: fields.socialAccountId ?? null,
        endpoint: fields.endpoint,
        httpStatus: err.httpStatus,
        metaErrorCode: err.code,
        metaErrorSubcode: err.subcode,
        message: err.message,
        fbtraceId: err.fbtraceId,
      })
      .catch(() => {});
    return;
  }

  if (err instanceof MetaNetworkError) {
    const line = { ...base, httpStatus: null, metaErrorCode: null, metaErrorSubcode: null, message: err.message, fbtraceId: null };
    console.error(JSON.stringify(line));
    void metaIntegrationLogsRepo
      .create({ step, socialAccountId: fields.socialAccountId ?? null, endpoint: fields.endpoint, message: err.message })
      .catch(() => {});
    return;
  }

  const message = err instanceof Error ? err.message : "Erro desconhecido.";
  console.error(JSON.stringify({ ...base, message }));
  void metaIntegrationLogsRepo
    .create({ step, socialAccountId: fields.socialAccountId ?? null, endpoint: fields.endpoint, message })
    .catch(() => {});
}
