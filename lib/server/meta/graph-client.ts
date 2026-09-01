import { request as httpsRequest } from "node:https";
import type { GraphErrorBody } from "./types";

/** Códigos de erro da Graph API que valem retry (rate limit / instabilidade temporária do
 *  lado da Meta) — lista consolidada a partir da documentação de "Erros da API do Graph"
 *  (Rate Limiting: 4, 17, 32, 613; genéricos/temporários: 1, 2). */
const RECOVERABLE_ERROR_CODES = new Set([1, 2, 4, 17, 32, 613]);

/** 190 = OAuthException (token inválido/expirado/revogado). Os subcódigos mais comuns:
 *  458 = app desautorizado pelo usuário, 459 = usuário precisa reconfirmar login,
 *  460 = senha/sessão mudou, 463 = token expirado, 467 = token inválido. */
const AUTH_ERROR_CODE = 190;

export class MetaGraphError extends Error {
  code: number | null;
  subcode: number | null;
  type: string | null;
  fbtraceId: string | null;
  httpStatus: number;
  raw: unknown;

  constructor(
    message: string,
    opts: {
      code?: number | null;
      subcode?: number | null;
      type?: string | null;
      fbtraceId?: string | null;
      httpStatus: number;
      raw?: unknown;
    }
  ) {
    super(message);
    this.name = "MetaGraphError";
    this.code = opts.code ?? null;
    this.subcode = opts.subcode ?? null;
    this.type = opts.type ?? null;
    this.fbtraceId = opts.fbtraceId ?? null;
    this.httpStatus = opts.httpStatus;
    this.raw = opts.raw;
  }

  /** Erro temporário do lado da Meta (rate limit, instabilidade) — vale a pena tentar de novo
   *  com backoff. */
  get isRecoverable(): boolean {
    if (this.code !== null && RECOVERABLE_ERROR_CODES.has(this.code)) return true;
    if (this.httpStatus === 429) return true;
    if (this.httpStatus >= 500) return true;
    return false;
  }

  /** Token inválido/expirado/revogado, ou permissão removida — não adianta tentar de novo, a
   *  conta precisa ser reconectada pela interface. */
  get isAuthError(): boolean {
    return this.code === AUTH_ERROR_CODE || this.httpStatus === 401;
  }

  /** Código curto e estável pra guardar em scheduled_post_accounts.error_code /
   *  publication_logs.error_code (não muda com a mensagem, que a Meta pode reformular). */
  get errorCode(): string {
    if (this.isAuthError) return `META_AUTH_${this.subcode ?? this.code ?? "UNKNOWN"}`;
    if (this.code !== null) return `META_${this.code}`;
    return `HTTP_${this.httpStatus}`;
  }
}

/** Erro de rede/timeout local (não chegou a ter resposta HTTP da Meta) — sempre recuperável. */
export class MetaNetworkError extends Error {
  readonly isRecoverable = true;
  readonly isAuthError = false;
  readonly errorCode = "NETWORK_ERROR";
  constructor(cause: unknown) {
    const nested = cause instanceof Error && "cause" in cause ? (cause as { cause?: unknown }).cause : null;
    const nestedMessage =
      nested instanceof Error
        ? nested.message
        : nested && typeof nested === "object" && "message" in nested
          ? String((nested as { message?: unknown }).message)
          : null;
    super(
      cause instanceof Error
        ? nestedMessage
          ? `${cause.message}: ${nestedMessage}`
          : cause.message
        : "Falha de rede ao chamar a Graph API."
    );
    this.name = "MetaNetworkError";
  }
}

/** Wrapper de fetch para a Graph API: sempre lança MetaGraphError (com código/tipo tipados) em
 *  respostas não-OK, e MetaNetworkError em falha de rede/timeout — nunca deixa um erro cru
 *  vazar pra quem chama, pra manter o tratamento de erro (fase 9) consistente em todos os
 *  adapters. */
export async function graphFetch<T>(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    try {
      return await graphHttpsRequest<T>(url, init, timeoutMs);
    } catch (fallbackErr) {
      throw new MetaNetworkError(fallbackErr instanceof Error ? fallbackErr : err);
    }
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  return parseGraphResponse<T>(res.status, res.ok, text);
}

async function graphHttpsRequest<T>(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const method = init?.method ?? "GET";
  const body = normalizeBody(init?.body);
  const headers = normalizeHeaders(init?.headers, body);

  const fallbackResponse = await new Promise<{ status: number; ok: boolean; text: string }>((resolve, reject) => {
    const req = httpsRequest(url, { method, headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const responseText = Buffer.concat(chunks).toString("utf8");
        const status = res.statusCode ?? 0;
        resolve({ status, ok: status >= 200 && status < 300, text: responseText });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout ao conectar na Graph API depois de ${timeoutMs}ms.`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });

  return parseGraphResponse<T>(fallbackResponse.status, fallbackResponse.ok, fallbackResponse.text);
}

function normalizeBody(body: BodyInit | null | undefined): string | Buffer | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new Error("Tipo de body não suportado pelo fallback HTTPS da Graph API.");
}

function normalizeHeaders(headers: HeadersInit | undefined, body: string | Buffer | null): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) normalized[key] = value;
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) normalized[key] = String(value);
  }
  if (body && !Object.keys(normalized).some((key) => key.toLowerCase() === "content-length")) {
    normalized["Content-Length"] = String(Buffer.byteLength(body));
  }
  return normalized;
}

function parseGraphResponse<T>(status: number, ok: boolean, text: string): T {
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  if (!ok) {
    const body = json as GraphErrorBody;
    throw new MetaGraphError(body.error?.message || `Erro na Graph API (HTTP ${status}).`, {
      code: body.error?.code ?? null,
      subcode: body.error?.error_subcode ?? null,
      type: body.error?.type ?? null,
      fbtraceId: body.error?.fbtrace_id ?? null,
      httpStatus: status,
      raw: json,
    });
  }

  return json as T;
}

export function graphUrl(base: string, path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${base}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
