"use client";

import type { PublicSocialAccount, ScheduledPostAccount } from "@/lib/server/meta/types";

/** Painel simples de status — sem analytics avançado, só o essencial pra saber o que está
 *  pendente, o que já foi, o que falhou e quais contas precisam de atenção. */
export function StatusSummary({
  accounts,
  socialAccounts,
}: {
  accounts: ScheduledPostAccount[];
  socialAccounts: PublicSocialAccount[];
}) {
  const upcoming = accounts.filter((a) => a.status === "scheduled" || a.status === "processing").length;
  const published = accounts.filter((a) => a.status === "published").length;
  const failed = accounts.filter((a) => a.status === "failed").length;
  const disconnected = socialAccounts.filter((a) => a.status !== "connected").length;

  const items = [
    { label: "Próximas publicações", value: upcoming, tone: "text-accent" },
    { label: "Publicados", value: published, tone: "text-[#4CD18A]" },
    { label: "Falhas", value: failed, tone: "text-red-300" },
    { label: "Contas desconectadas", value: disconnected, tone: "text-amber-300" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-3.5">
          <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
          <p className="mt-0.5 text-xs text-muted">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
