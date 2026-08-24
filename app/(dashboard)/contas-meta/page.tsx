"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";
import { DiscoveryPicker } from "@/components/meta/discovery-picker";
import { SocialAccountRow } from "@/components/meta/social-account-row";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

function ContasMetaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [accounts, setAccounts] = useState<PublicSocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sessionId = searchParams.get("meta_session");
  const metaError = searchParams.get("meta_error");
  const metaNotice = searchParams.get("meta_notice");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/meta/accounts");
    if (res.ok) setAccounts((await res.json()) as PublicSocialAccount[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  async function handleDisconnect(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/meta/accounts/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) await refresh();
  }

  function dismissError() {
    router.replace("/contas-meta");
  }

  const instagramAccounts = accounts.filter((a) => a.platform === "INSTAGRAM");
  const facebookAccounts = accounts.filter((a) => a.platform === "FACEBOOK");

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Contas conectadas</h1>
          <p className="mt-1 text-sm text-muted">
            Conecte quantas contas do Instagram e Páginas do Facebook forem necessárias — cada
            conta tem seu próprio login e token, sem nada compartilhado entre elas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/api/meta/auth"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
          >
            <Link2 size={15} />
            Conectar Meta
          </a>
          <a
            href="/api/meta/auth?switch_account=1"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-card"
          >
            Trocar usuário
          </a>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted">
        Para testar múltiplas contas, use um Facebook que seja admin das Páginas desejadas. Para
        conectar outro Facebook no mesmo navegador, clique em <strong>Trocar usuário</strong>.
      </div>

      {metaError && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <span>Erro ao conectar: {metaError}</span>
          <button type="button" onClick={dismissError} className="shrink-0 font-semibold underline">
            fechar
          </button>
        </div>
      )}
      {metaNotice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          <span>{metaNotice}</span>
          <button type="button" onClick={dismissError} className="shrink-0 font-semibold underline">
            fechar
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-muted">Carregando contas…</p>
      ) : accounts.length === 0 ? (
        <div className="mt-8 flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
          Nenhuma conta conectada ainda. Clique em &quot;Conectar Meta&quot; para começar.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Instagram · {instagramAccounts.length}
            </p>
            <div className="flex flex-col gap-2">
              {instagramAccounts.length === 0 ? (
                <p className="text-xs text-muted">Nenhuma conta do Instagram conectada.</p>
              ) : (
                instagramAccounts.map((account) => (
                  <SocialAccountRow
                    key={account.id}
                    account={account}
                    onDisconnect={handleDisconnect}
                    busy={busyId === account.id}
                  />
                ))
              )}
            </div>
          </section>
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Facebook · {facebookAccounts.length}
            </p>
            <div className="flex flex-col gap-2">
              {facebookAccounts.length === 0 ? (
                <p className="text-xs text-muted">Nenhuma Página do Facebook conectada.</p>
              ) : (
                facebookAccounts.map((account) => (
                  <SocialAccountRow
                    key={account.id}
                    account={account}
                    onDisconnect={handleDisconnect}
                    busy={busyId === account.id}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {sessionId && <DiscoveryPicker sessionId={sessionId} onConnected={refresh} />}
    </div>
  );
}

export default function ContasMetaPage() {
  return (
    <Suspense fallback={null}>
      <ContasMetaContent />
    </Suspense>
  );
}
