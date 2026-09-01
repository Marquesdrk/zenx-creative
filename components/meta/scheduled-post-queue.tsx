"use client";

import { Play } from "lucide-react";
import type { PublicSocialAccount, ScheduledPost, ScheduledPostAccount, ScheduledPostAccountStatus } from "@/lib/server/meta/types";

const STATUS_LABEL: Record<ScheduledPostAccountStatus, string> = {
  scheduled: "Agendado",
  processing: "Publicando…",
  published: "Publicado",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const STATUS_CLASS: Record<ScheduledPostAccountStatus, string> = {
  scheduled: "bg-accent/15 text-accent",
  processing: "bg-accent/15 text-accent",
  published: "bg-[#4CD18A]/15 text-[#4CD18A]",
  failed: "bg-red-500/15 text-red-300",
  cancelled: "bg-card-hover text-muted",
};

/** Fila de publicações — 1 vídeo pode ter N contas de destino, cada uma com seu próprio
 *  status independente (um erro numa conta nunca aparece como erro nas demais). */
export function ScheduledPostQueue({
  posts,
  accounts,
  accountsById,
  onRunDue,
  runningDue,
}: {
  posts: ScheduledPost[];
  accounts: ScheduledPostAccount[];
  accountsById: Map<string, PublicSocialAccount>;
  onRunDue: () => void;
  runningDue: boolean;
}) {
  return (
    <aside className="rounded-xl border border-border bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Fila de publicações</p>
          <p className="mt-0.5 text-xs text-muted">{posts.length} vídeo(s)</p>
        </div>
        <button
          type="button"
          onClick={onRunDue}
          disabled={runningDue}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[#171717] px-2.5 text-[11px] font-semibold text-gray-200 hover:bg-card-hover disabled:opacity-50"
        >
          <Play size={12} />
          Rodar pendentes
        </button>
      </div>

      <div className="max-h-[680px] overflow-y-auto p-3">
        {posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
            Nenhuma publicação ainda.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {posts.map((post) => {
              const destinations = accounts.filter((a) => a.scheduledPostId === post.id);
              return (
                <div key={post.id} className="rounded-lg border border-border bg-card p-3">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {post.caption || "(sem legenda)"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {post.status === "draft"
                      ? "Aguardando destinos"
                      : post.scheduledAt
                        ? new Date(post.scheduledAt).toLocaleString()
                        : "Publicação imediata"}
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {destinations.length === 0 ? (
                      <div className="rounded-md bg-background px-2 py-1.5 text-[11px] text-muted">
                        Vídeo alocado para postagem. Selecione contas e horário antes de publicar.
                      </div>
                    ) : (
                      destinations.map((destination) => {
                        const account = accountsById.get(destination.socialAccountId);
                        return (
                          <div key={destination.id} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5">
                            <span className="truncate text-[11px] text-gray-300">
                              {account ? `${account.platform === "INSTAGRAM" ? "IG" : "FB"} · ${account.accountName}` : "Conta removida"}
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[destination.status]}`}>
                              {STATUS_LABEL[destination.status]}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {destinations.some((d) => d.status === "failed" && d.errorMessage) && (
                    <div className="mt-2 flex flex-col gap-1">
                      {destinations
                        .filter((d) => d.status === "failed" && d.errorMessage)
                        .map((d) => (
                          <p key={d.id} className="text-[11px] text-red-300">
                            {accountsById.get(d.socialAccountId)?.accountName ?? "Conta"}: {d.errorMessage}
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
