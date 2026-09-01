"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check, Flag } from "lucide-react";
import type { DiscoverySessionSummary } from "@/lib/server/meta/types";

/** Mostrado depois do OAuth (quando a URL tem ?meta_session=...): lista o que foi encontrado
 *  na conta Meta autorizada e deixa o usuário escolher o que conectar — nada é conectado
 *  automaticamente antes de confirmar aqui. */
export function DiscoveryPicker({ sessionId, onConnected }: { sessionId: string; onConnected: () => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<DiscoverySessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/meta/discover?session=${encodeURIComponent(sessionId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Falha ao carregar os ativos encontrados.");
        }
        return (await res.json()) as DiscoverySessionSummary;
      })
      .then((data) => {
        if (cancelled) return;
        setSummary(data);
        // Pré-marca só o que ainda não está conectado, pra não reconectar sem querer algo já ativo.
        setSelected(new Set(data.assets.filter((a) => !a.alreadyConnected).map((a) => a.key)));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Falha ao carregar ativos."));
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function close() {
    router.replace("/contas-meta");
  }

  async function confirm() {
    if (selected.size === 0) return;
    setSubmitting(true);
    const res = await fetch("/api/meta/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, selectedKeys: Array.from(selected) }),
    });
    setSubmitting(false);
    if (res.ok) {
      onConnected();
      close();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Falha ao conectar as contas selecionadas.");
    }
  }

  const igAccounts = summary?.assets.filter((a) => a.platform === "INSTAGRAM") ?? [];
  const pages = summary?.assets.filter((a) => a.platform === "FACEBOOK") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-[#0d0d0d] p-6">
        <h2 className="text-lg font-semibold text-foreground">Contas disponíveis</h2>
        <p className="mt-1 text-sm text-muted">
          Escolha quais Páginas do Facebook e contas do Instagram você quer conectar.
        </p>

        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
        {!summary && !error && <p className="mt-6 text-sm text-muted">Carregando ativos encontrados…</p>}

        {summary && (
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            {summary.assets.length === 0 && (
              <p className="text-sm text-muted">
                Nenhuma Página ou conta do Instagram encontrada para esse login.
              </p>
            )}
            {igAccounts.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Instagram</p>
                <div className="flex flex-col gap-2">
                  {igAccounts.map((asset) =>
                    asset.platform === "INSTAGRAM" ? (
                      <AssetRow
                        key={asset.key}
                        label={`@${asset.username}`}
                        sublabel={asset.pageName}
                        icon={<AtSign size={14} />}
                        picture={asset.profilePictureUrl}
                        alreadyConnected={asset.alreadyConnected}
                        checked={selected.has(asset.key)}
                        onToggle={() => toggle(asset.key)}
                      />
                    ) : null
                  )}
                </div>
              </div>
            )}
            {pages.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Facebook</p>
                <div className="flex flex-col gap-2">
                  {pages.map((asset) =>
                    asset.platform === "FACEBOOK" ? (
                      <AssetRow
                        key={asset.key}
                        label={asset.name}
                        sublabel={asset.category}
                        icon={<Flag size={14} />}
                        picture={asset.profilePictureUrl}
                        alreadyConnected={asset.alreadyConnected}
                        checked={selected.has(asset.key)}
                        onToggle={() => toggle(asset.key)}
                      />
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting || selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
          >
            <Check size={13} />
            Conectar{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetRow({
  label,
  sublabel,
  icon,
  picture,
  alreadyConnected,
  checked,
  onToggle,
}: {
  label: string;
  sublabel: string | null;
  icon: ReactNode;
  picture: string | null;
  alreadyConnected: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors ${
        checked ? "border-accent bg-card-hover" : "border-border bg-card hover:bg-card-hover"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-accent" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-hover text-muted">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar remoto da Meta
          <img src={picture} alt="" className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{label}</p>
        {sublabel && <p className="truncate text-xs text-muted">{sublabel}</p>}
      </div>
      {alreadyConnected && (
        <span className="shrink-0 rounded-full bg-card-hover px-2 py-0.5 text-[10px] text-muted">Já conectado</span>
      )}
    </label>
  );
}
