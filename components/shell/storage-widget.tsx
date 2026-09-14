"use client";

import { useEffect, useState } from "react";

type StorageSummary = { usedBytes: number; quotaBytes: number; usedPercent: number };
type CachedStorageSummary = { savedAt: number; summary: StorageSummary };

const CACHE_KEY = "zenx-storage-summary-v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

function readCachedSummary(): CachedStorageSummary | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedStorageSummary | null;
    if (
      !value ||
      typeof value.savedAt !== "number" ||
      typeof value.summary?.usedBytes !== "number" ||
      typeof value.summary?.quotaBytes !== "number" ||
      typeof value.summary?.usedPercent !== "number"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Uso real de armazenamento do Zenx (renders/uploads/lotes — Vercel Blob em produção, disco
 *  local em dev). Nunca inclui o Google Drive do usuário, que é uma conta separada dele. */
export function StorageWidget() {
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const cached = readCachedSummary();
    let cancelled = false;

    if (cached) {
      Promise.resolve().then(() => {
        if (!cancelled) setSummary(cached.summary);
      });
    }

    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      return () => {
        cancelled = true;
      };
    }

    fetch("/api/storage/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao consultar armazenamento.");
        return res.json() as Promise<StorageSummary>;
      })
      .then((nextSummary) => {
        if (cancelled) return;
        setSummary(nextSummary);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), summary: nextSummary }));
        } catch {
          // A contagem continua funcionando mesmo se o navegador bloquear o armazenamento local.
        }
      })
      .catch(() => {
        if (!cancelled && !cached) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const percent = summary?.usedPercent ?? 0;
  const usedGb = summary ? formatGb(summary.usedBytes) : "—";
  const quotaGb = summary ? formatGb(summary.quotaBytes) : "—";

  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">Armazenamento</span>
        <span className="text-muted">{summary ? `${percent}%` : "…"}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-muted">
        <span>{summary ? `${percent}% utilizado` : loadFailed ? "Indisponível" : "Carregando…"}</span>
        <span>
          {usedGb} GB / {quotaGb} GB
        </span>
      </div>
    </div>
  );
}
