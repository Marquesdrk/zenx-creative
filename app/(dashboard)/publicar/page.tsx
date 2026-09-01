"use client";

import { useCallback, useEffect, useState } from "react";
import { ScheduledPostComposer } from "@/components/meta/scheduled-post-composer";
import { ScheduledPostQueue } from "@/components/meta/scheduled-post-queue";
import { StatusSummary } from "@/components/meta/status-summary";
import type { PublicSocialAccount, ScheduledPost, ScheduledPostAccount } from "@/lib/server/meta/types";

export default function PublicarPage() {
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
    await fetch("/api/scheduled-posts/run-due", { method: "POST" });
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <ScheduledPostComposer accounts={socialAccounts} onCreated={refresh} />
        <ScheduledPostQueue
          posts={posts}
          accounts={accounts}
          accountsById={accountsById}
          onRunDue={runDue}
          runningDue={runningDue}
        />
      </div>
    </div>
  );
}
