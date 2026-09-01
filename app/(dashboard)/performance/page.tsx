"use client";

import { useEffect, useState } from "react";
import { PerformanceSkeleton } from "@/components/skeletons/performance-skeleton";

type SummaryRow = {
  publicationId: string;
  platformLabel: string;
  profileName: string;
  filename: string;
  permalink: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

type Summary = {
  rows: SummaryRow[];
  totals: { views: number; likes: number; comments: number; shares: number };
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xl font-bold text-foreground">{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export default function PerformancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/performance/summary");
      setSummary(await res.json());
    } catch {
      setSummary({ rows: [], totals: { views: 0, likes: 0, comments: 0, shares: 0 } });
    }
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/metrics/sync", { method: "POST" }).catch(() => {});
    await load();
    setSyncing(false);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Performance dos perfis</h1>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          {syncing ? "Sincronizando…" : "Exportar relatório"}
        </button>
      </div>
      <p className="mb-8 text-sm text-muted">Acompanhe o desempenho dos seus perfis e conteúdos.</p>

      {!summary ? (
        <PerformanceSkeleton />
      ) : summary.rows.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted">
          Nenhuma publicação ainda. Conecte uma plataforma e publique um vídeo renderizado no Editor
          em massa para ver métricas aqui.
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <StatCard label="visualizações" value={summary.totals.views} />
            <StatCard label="curtidas" value={summary.totals.likes} />
            <StatCard label="comentários" value={summary.totals.comments} />
            <StatCard label="compartilhamentos" value={summary.totals.shares} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-2">Perfil</th>
                  <th className="px-4 py-2">Plataforma</th>
                  <th className="px-4 py-2">Arquivo</th>
                  <th className="px-4 py-2">Views</th>
                  <th className="px-4 py-2">Curtidas</th>
                  <th className="px-4 py-2">Comentários</th>
                  <th className="px-4 py-2">Compart.</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.publicationId} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{row.profileName}</td>
                    <td className="px-4 py-2 text-muted">{row.platformLabel}</td>
                    <td className="px-4 py-2 text-muted">
                      {row.permalink ? (
                        <a
                          href={row.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline"
                        >
                          {row.filename}
                        </a>
                      ) : (
                        row.filename
                      )}
                    </td>
                    <td className="px-4 py-2 text-foreground">{row.views}</td>
                    <td className="px-4 py-2 text-foreground">{row.likes}</td>
                    <td className="px-4 py-2 text-foreground">{row.comments}</td>
                    <td className="px-4 py-2 text-foreground">{row.shares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
