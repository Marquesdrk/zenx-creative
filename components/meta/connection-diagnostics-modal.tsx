"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck, PlayCircle, RefreshCw } from "lucide-react";
import type { MetaIntegrationLogEntry, PublicSocialAccount } from "@/lib/server/meta/types";

type DiagnosticsResponse = { account: PublicSocialAccount; logs: MetaIntegrationLogEntry[] };
type VerifyResponse = { valid: boolean; reason?: string; scopes?: string[]; account: PublicSocialAccount };
type TestPublishResponse = { ok: true; mediaId: string } | { error: string; errorCode?: string };

const STATUS_LABEL: Record<PublicSocialAccount["status"], string> = {
  connected: "Conectado",
  expired: "Token expirado",
  revoked: "Revogado",
  error: "Erro",
};

/** Modal "Diagnóstico da conexão": mostra tudo que é preciso pra saber por que uma conta
 *  parou de funcionar (IG Account ID, Página vinculada, status do token, permissões
 *  concedidas, última validação, erro da Graph API) e concentra as duas ações manuais do
 *  fluxo — Testar conexão (/debug_token) e Publicar Reel teste (bypassa o agendador). */
export function ConnectionDiagnosticsModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const [videoUrl, setVideoUrl] = useState("");
  const [caption, setCaption] = useState("Reel de teste — publicado pelo Zenx Creative.");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<TestPublishResponse | null>(null);

  async function fetchDiagnostics(): Promise<DiagnosticsResponse | null> {
    const res = await fetch(`/api/meta/accounts/${accountId}/diagnostics`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Falha ao carregar diagnóstico.");
    return json as DiagnosticsResponse;
  }

  async function load() {
    try {
      const result = await fetchDiagnostics();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar diagnóstico.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meta/accounts/${accountId}/diagnostics`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Falha ao carregar diagnóstico.");
        return json as DiagnosticsResponse;
      })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Falha ao carregar diagnóstico."));
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function testConnection() {
    setVerifying(true);
    setVerifyResult(null);
    const res = await fetch(`/api/meta/accounts/${accountId}/verify`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setVerifying(false);
    if (res.ok) {
      setVerifyResult(json as VerifyResponse);
      await load();
    } else {
      setError(json.error || "Falha ao testar conexão.");
    }
  }

  async function testPublish() {
    if (!videoUrl.trim()) return;
    setPublishing(true);
    setPublishResult(null);
    const res = await fetch(`/api/meta/accounts/${accountId}/test-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: videoUrl.trim(), caption }),
    });
    const json = await res.json().catch(() => ({ error: "Resposta inválida do servidor." }));
    setPublishing(false);
    setPublishResult(json as TestPublishResponse);
    await load();
  }

  const account = data?.account;
  const lastApiError = data?.logs.find((log) => log.step === "META_API_ERROR");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-[#0d0d0d] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Diagnóstico da conexão</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

        {!data && !error && <p className="mt-6 text-sm text-muted">Carregando…</p>}

        {account && (
          <div className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
            <section className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm">
              <Field label="Conta" value={account.accountName} />
              <Field label="Plataforma" value={account.platform} />
              <Field label="Instagram Account ID" value={account.instagramUserId ?? "—"} />
              <Field label="Facebook Page" value={account.pageId ? `${account.pageId}${account.metadata.linkedPageName ? ` (${account.metadata.linkedPageName})` : ""}` : "—"} />
              <Field label="Status do token" value={STATUS_LABEL[account.status]} />
              <Field label="Última validação" value={account.lastCheckedAt ? new Date(account.lastCheckedAt).toLocaleString("pt-BR") : "Nunca"} />
              <div className="col-span-2">
                <p className="text-[11px] font-semibold uppercase text-muted">Permissões disponíveis</p>
                <p className="mt-1 text-xs text-foreground">
                  {account.permissions.length > 0 ? account.permissions.join(", ") : "Nenhuma capturada ainda — clique em Testar conexão."}
                </p>
              </div>
              {(account.lastError || lastApiError) && (
                <div className="col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                  <p className="font-semibold">Erro da API</p>
                  <p>{account.lastError ?? lastApiError?.message}</p>
                  {lastApiError && (
                    <p className="mt-1 text-[11px] opacity-80">
                      endpoint: {lastApiError.endpoint ?? "—"} · http: {lastApiError.httpStatus ?? "—"} · code: {lastApiError.metaErrorCode ?? "—"} ·
                      subcode: {lastApiError.metaErrorSubcode ?? "—"} · fbtrace_id: {lastApiError.fbtraceId ?? "—"}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Testar conexão</p>
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={verifying}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[#171717] px-3 text-xs font-semibold text-gray-200 hover:bg-card-hover disabled:opacity-50"
                >
                  {verifying ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  {verifying ? "Testando…" : "Testar conexão"}
                </button>
              </div>
              {verifyResult && (
                <p className={`mt-2 text-xs ${verifyResult.valid ? "text-emerald-300" : "text-red-300"}`}>
                  {verifyResult.valid ? "Token válido." : `Token inválido: ${verifyResult.reason}`}
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Publicar Reel teste</p>
              <p className="mt-1 text-xs text-muted">URL pública HTTPS de um vídeo .mp4 (a Meta baixa o arquivo dessa URL).</p>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://seu-dominio.com/video-teste.mp4"
                className="mt-2 h-9 w-full rounded-lg border border-border bg-[#101014] px-3 text-sm text-foreground placeholder:text-muted"
              />
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Legenda"
                className="mt-2 h-9 w-full rounded-lg border border-border bg-[#101014] px-3 text-sm text-foreground placeholder:text-muted"
              />
              <button
                type="button"
                onClick={testPublish}
                disabled={publishing || !videoUrl.trim() || account.status !== "connected"}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-background disabled:opacity-50"
              >
                {publishing ? <RefreshCw size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                {publishing ? "Publicando…" : "Publicar Reel teste"}
              </button>
              {publishResult && "ok" in publishResult && (
                <p className="mt-2 text-xs text-emerald-300">Publicado! ID da mídia: {publishResult.mediaId}</p>
              )}
              {publishResult && "error" in publishResult && (
                <p className="mt-2 text-xs text-red-300">
                  Falha ({publishResult.errorCode ?? "erro"}): {publishResult.error}
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Histórico de eventos</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {data.logs.length === 0 && <p>Nenhum evento registrado ainda.</p>}
                {data.logs.map((log) => (
                  <p key={log.id}>
                    <span className="font-mono text-[10px] text-accent">{log.step}</span> — {new Date(log.createdAt).toLocaleString("pt-BR")}
                    {log.message ? ` — ${log.message}` : ""}
                  </p>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-muted">{label}</p>
      <p className="mt-0.5 truncate text-xs text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
