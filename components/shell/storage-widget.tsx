"use client";

import { useEffect, useState } from "react";

type StorageSummary = { usedBytes: number; quotaBytes: number; usedPercent: number };

function formatGb(bytes: number): string {
  return (bytes / 1024 ** 3).toFixed(1);
}

/** Uso real de armazenamento do Zenx (renders/uploads/lotes — Vercel Blob em produção, disco
 *  local em dev). Nunca inclui o Google Drive do usuário, que é uma conta separada dele. */
export function StorageWidget() {
  const [summary, setSummary] = useState<StorageSummary | null>(null);

  useEffect(() => {
    fetch("/api/storage/summary")
      .then((res) => res.json())
      .then(setSummary)
      .catch(() => setSummary({ usedBytes: 0, quotaBytes: 50 * 1024 ** 3, usedPercent: 0 }));
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
        <span>{summary ? `${percent}% utilizado` : "Carregando…"}</span>
        <span>
          {usedGb} GB / {quotaGb} GB
        </span>
      </div>
    </div>
  );
}
