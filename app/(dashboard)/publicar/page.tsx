"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers3, Send } from "lucide-react";
import { BulkScheduleComposer } from "@/components/meta/bulk-schedule-composer";
import { ScheduledPostComposer } from "@/components/meta/scheduled-post-composer";
import { ScheduledPostQueue } from "@/components/meta/scheduled-post-queue";
import { StatusSummary } from "@/components/meta/status-summary";
import type { PublicSocialAccount, ScheduledPost, ScheduledPostAccount } from "@/lib/server/meta/types";

export default function PublicarPage() {
  const [publishMode, setPublishMode] = useState<"manual" | "bulk">("manual");
  const [socialAccounts, setSocialAccounts] = useState<PublicSocialAccount[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [accounts, setAccounts] = useState<ScheduledPostAccount[]>([]);
  const [runningDue, setRunningDue] = useState(false);

  const refresh = useCallback(async () => {
    const [socialRes, postsRes] = await Promise.all([fetch("/api/meta/accounts"), fetch("/api/scheduled-posts")]);
    if (socialRes.ok) setSocialAccounts((await socialRes.json()) as PublicSocialAccount[]);
    if (postsRes.ok) {
      const data = (await postsRes.json()) as { posts: ScheduledPost[]; accounts: ScheduledPostAccount[] };
      setPosts(data.posts);
      setAccounts(data.accounts);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      // Faz o backfill das pastas das contas antigas ao entrar no fluxo de publicação.
      // A operação é idempotente e não impede a tela de abrir se o Drive não estiver conectado.
      await fetch("/api/meta/accounts/ensure-drive-folders", { method: "POST" }).catch(() => {});
      await refresh();
    })();
  }, [refresh]);

  // Recarrega periodicamente pra refletir publicações assíncronas concluindo em segundo plano
  // (o Instagram pode levar minutos processando o vídeo) sem o usuário precisar atualizar a página.
  useEffect(() => {
    const interval = setInterval(() => {
      void refresh();
    }, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function runDue() {
    setRunningDue(true);
    await fetch("/api/scheduled-posts/run-due-manual", { method: "POST" });
    setRunningDue(false);
    await refresh();
  }

  const accountsById = new Map(socialAccounts.map((account) => [account.id, account]));

  return (
    <div>
      <div className="mb-1">
        <h1 className="text-2xl font-semibold text-foreground">Publicar</h1>
        <p className="mt-1 text-sm text-muted">
          Envie um vídeo, escolha as contas do Instagram e Facebook conectadas e publique agora
          ou agende para depois.
        </p>
      </div>

      <div className="mt-6">
        <StatusSummary accounts={accounts} socialAccounts={socialAccounts} />
      </div>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-[#0d0d0d] p-1">
            <button
              type="button"
              onClick={() => setPublishMode("manual")}
              aria-pressed={publishMode === "manual"}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors ${publishMode === "manual" ? "bg-accent text-background" : "text-muted hover:bg-card-hover hover:text-foreground"}`}
            >
              <Send size={14} />
              Publicação manual
            </button>
            <button
              type="button"
              onClick={() => setPublishMode("bulk")}
              aria-pressed={publishMode === "bulk"}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors ${publishMode === "bulk" ? "bg-accent text-background" : "text-muted hover:bg-card-hover hover:text-foreground"}`}
            >
              <Layers3 size={14} />
              Agendamento em lote
            </button>
          </div>
          <div className="mt-3">
            {publishMode === "manual" ? (
              <ScheduledPostComposer accounts={socialAccounts} onCreated={refresh} />
            ) : (
              <BulkScheduleComposer accounts={socialAccounts} onCreated={refresh} />
            )}
          </div>
        </div>
        <ScheduledPostQueue
          posts={posts}
          accounts={accounts}
          accountsById={accountsById}
          onRunDue={runDue}
          runningDue={runningDue}
          onChanged={refresh}
        />
      </div>
    </div>
  );
}
