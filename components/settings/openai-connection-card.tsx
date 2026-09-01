"use client";

import { useEffect, useState } from "react";

/** Ao contrário do Drive (OAuth), a OpenAI Platform usa uma chave de API — diferente da
 *  assinatura ChatGPT Plus, gerada em platform.openai.com/api-keys, com cobrança própria. É
 *  essa chave que o Criador de Avatar usa pra gerar documentos e imagens do personagem. */
export function OpenAiConnectionCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshStatus() {
    fetch("/api/openai/status")
      .then((res) => res.json())
      .then((data: { connected: boolean }) => setConnected(data.connected))
      .catch(() => setConnected(false));
  }

  useEffect(refreshStatus, []);

  async function handleConnect() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/openai/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Falha ao conectar.");
      return;
    }
    setApiKey("");
    refreshStatus();
  }

  async function handleDisconnect() {
    setSaving(true);
    await fetch("/api/openai/disconnect", { method: "POST" });
    setSaving(false);
    refreshStatus();
  }

  if (connected === null) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">OpenAI (ChatGPT)</p>
          <p className="text-xs text-muted">
            {connected
              ? "Conectada — o Criador de Avatar já pode gerar documentos e imagens do personagem."
              : "Não conectada. Gere uma chave em platform.openai.com/api-keys (cobrança separada do ChatGPT Plus)."}
          </p>
        </div>
        {connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted hover:bg-card-hover disabled:opacity-50"
          >
            Desconectar
          </button>
        )}
      </div>
      {!connected && (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted"
          />
          <button
            type="button"
            onClick={handleConnect}
            disabled={saving || !apiKey.trim()}
            className="rounded-lg bg-accent px-4 text-xs font-semibold text-background disabled:opacity-50"
          >
            {saving ? "Conectando…" : "Conectar"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
