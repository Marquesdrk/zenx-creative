"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Filter, FolderPlus, MoreVertical, Plus, Stethoscope, Unlink, Users } from "lucide-react";
import { ConnectionDiagnosticsModal } from "@/components/meta/connection-diagnostics-modal";
import { DiscoveryPicker } from "@/components/meta/discovery-picker";
import { Topbar } from "@/components/shell/topbar";
import { AppCard } from "@/components/ui/app-card";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PublicSocialAccount, SocialAccountStatus } from "@/lib/server/meta/types";

type BrandAccounts = {
  key: string;
  name: string;
  handle: string;
  profilePictureUrl: string | null;
  instagram: PublicSocialAccount | null;
  facebook: PublicSocialAccount | null;
};

function connectionLabel(status: SocialAccountStatus | "disconnected") {
  if (status === "connected") return "Ativa";
  if (status === "expired") return "Token expirado";
  if (status === "revoked") return "Desconectada";
  if (status === "error") return "Problema";
  return "Desconectada";
}

function connectionTone(status: SocialAccountStatus | "disconnected") {
  if (status === "connected") return "success";
  if (status === "expired") return "warning";
  if (status === "revoked" || status === "error") return "danger";
  return "idle";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function groupAccounts(accounts: PublicSocialAccount[]) {
  const map = new Map<string, BrandAccounts>();
  for (const account of accounts) {
    const key = account.pageId ?? account.platformAccountId ?? account.accountName;
    const current =
      map.get(key) ??
      ({
        key,
        name: account.platform === "FACEBOOK" ? account.accountName : account.accountName || account.username || "Marca",
        handle: account.username ? `@${account.username.replace(/^@/, "")}` : "marca conectada",
        profilePictureUrl: account.profilePictureUrl,
        instagram: null,
        facebook: null,
      } satisfies BrandAccounts);
    if (account.platform === "INSTAGRAM") {
      current.instagram = account;
      current.profilePictureUrl = current.profilePictureUrl ?? account.profilePictureUrl;
    }
    if (account.platform === "FACEBOOK") {
      current.facebook = account;
      current.name = account.accountName;
      current.handle = account.username ? `@${account.username.replace(/^@/, "")}` : current.handle;
      current.profilePictureUrl = account.profilePictureUrl ?? current.profilePictureUrl;
    }
    map.set(key, current);
  }
  return Array.from(map.values());
}

function AccountSlot({
  platform,
  account,
}: {
  platform: "INSTAGRAM" | "TIKTOK" | "FACEBOOK";
  account?: PublicSocialAccount | null;
}) {
  const status = account?.status ?? "disconnected";
  return (
    <div className="min-w-0 rounded-lg border border-border bg-[#101014] p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <PlatformIcon platform={platform} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{platform === "INSTAGRAM" ? "Instagram" : platform === "FACEBOOK" ? "Facebook" : "TikTok"}</p>
          <p className="truncate text-xs text-muted">
            {account?.username ? `@${account.username.replace(/^@/, "")}` : account ? account.accountName : "Não conectado"}
          </p>
        </div>
      </div>
      <div className="mt-2.5">
        <StatusBadge tone={connectionTone(status)}>{connectionLabel(status)}</StatusBadge>
      </div>
    </div>
  );
}

function ContasMetaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [accounts, setAccounts] = useState<PublicSocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [diagnosticsAccountId, setDiagnosticsAccountId] = useState<string | null>(null);
  const [driveFolderMessage, setDriveFolderMessage] = useState<string | null>(null);

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

  async function handleEnsureDriveFolder(id: string) {
    setBusyId(id);
    setDriveFolderMessage(null);
    const res = await fetch(`/api/meta/accounts/${id}/ensure-drive-folder`, { method: "POST" });
    const data = await res.json().catch(() => ({}) as { error?: string; folder?: string });
    setBusyId(null);
    setDriveFolderMessage(res.ok ? `Pasta pronta: ${data.folder}` : data.error || "Falha ao criar a pasta no Drive.");
  }

  function dismissError() {
    router.replace("/contas-meta");
  }

  const instagramAccounts = accounts.filter((account) => account.platform === "INSTAGRAM");
  const facebookAccounts = accounts.filter((account) => account.platform === "FACEBOOK");
  const brandRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return groupAccounts(accounts).filter((brand) => {
      if (!normalized) return true;
      return `${brand.name} ${brand.handle}`.toLowerCase().includes(normalized);
    });
  }, [accounts, query]);
  const activeCount = accounts.filter((account) => account.status === "connected").length;
  const problemCount = accounts.filter((account) => account.status !== "connected").length;
  const limit = 100;

  return (
    <div>
      <Topbar
        searchPlaceholder="Buscar contas..."
        action={
          <a href="/api/meta/instagram/auth" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 text-sm font-semibold text-white">
            <Plus size={16} />
            Conectar Instagram
          </a>
        }
      />
      <PageHeader title="Contas conectadas" description="Gerencie todas as suas contas de redes sociais conectadas às suas marcas." />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} value={brandRows.length} label="Marcas conectadas" />
        <StatCard icon={CheckCircle2} value={instagramAccounts.length} label="Contas Instagram" tone="pink" />
        <StatCard icon={CheckCircle2} value={0} label="Contas TikTok" tone="blue" />
        <StatCard icon={CheckCircle2} value={facebookAccounts.length} label="Contas Facebook" tone="blue" />
        <StatCard icon={Users} value={`${accounts.length} / ${limit}`} label="Contas utilizadas" />
      </div>

      {metaError && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <span>Erro ao conectar: {metaError}</span>
          <button type="button" onClick={dismissError} className="shrink-0 font-semibold underline">fechar</button>
        </div>
      )}
      {metaNotice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-[#B8B0FF]">
          <span>{metaNotice}</span>
          <button type="button" onClick={dismissError} className="shrink-0 font-semibold underline">fechar</button>
        </div>
      )}
      {driveFolderMessage && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-[#B8B0FF]">
          <span>{driveFolderMessage}</span>
          <button type="button" onClick={() => setDriveFolderMessage(null)} className="shrink-0 font-semibold underline">fechar</button>
        </div>
      )}

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-5 text-sm">
              <button type="button" className="border-b-2 border-accent pb-2 font-semibold text-foreground">Todas as marcas</button>
              <button type="button" className="pb-2 text-muted">Contas desconectadas</button>
            </div>
            <div className="flex gap-2">
              <label className="relative">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar marca..." className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted" />
              </label>
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                <Filter size={15} />
                Filtros
              </button>
            </div>
          </div>

          <AppCard className="overflow-hidden">
            <div className="grid grid-cols-[minmax(160px,1fr)_minmax(0,2.2fr)_auto] gap-4 border-b border-border px-4 py-3 text-[11px] font-semibold uppercase text-muted">
              <span>Marca</span>
              <span>Contas conectadas</span>
              <span className="text-right">Ações</span>
            </div>
            {loading ? (
              <div className="p-4 text-sm text-muted">Carregando contas...</div>
            ) : brandRows.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center border-dashed text-center">
                <p className="text-sm font-semibold text-foreground">Nenhuma marca conectada</p>
                <p className="mt-2 text-sm text-muted">Conecte uma conta Meta para começar.</p>
              </div>
            ) : (
              brandRows.map((brand) => (
                <div key={brand.key} className="grid grid-cols-[minmax(160px,1fr)_minmax(0,2.2fr)_auto] items-center gap-4 border-b border-border px-4 py-5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-3">
                    {brand.profilePictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar remoto da Meta, fora do domínio de imagens do Next
                      <img
                        src={brand.profilePictureUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-bold text-white">
                        {initials(brand.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{brand.name}</p>
                      <p className="truncate text-xs text-muted">{brand.handle}</p>
                      {brand.key === brandRows[0]?.key && <span className="mt-2 inline-flex rounded-full bg-accent/20 px-2 py-1 text-[11px] font-semibold text-[#B8B0FF]">Marca principal</span>}
                    </div>
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <AccountSlot platform="INSTAGRAM" account={brand.instagram} />
                    <AccountSlot platform="TIKTOK" />
                    <AccountSlot platform="FACEBOOK" account={brand.facebook} />
                  </div>
                  <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                    <a
                      href="/api/meta/auth?switch_account=1"
                      className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-[#101014] px-4 text-sm font-semibold text-foreground hover:bg-card-hover"
                    >
                      Gerenciar
                    </a>
                    {brand.instagram && (
                      <button
                        type="button"
                        onClick={() => handleEnsureDriveFolder(brand.instagram!.id)}
                        disabled={busyId === brand.instagram.id}
                        aria-label={`Criar pasta no Drive para ${brand.name}`}
                        title="Criar pasta de agendados no Google Drive"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-[#101014] text-muted hover:bg-card-hover hover:text-foreground disabled:opacity-40"
                      >
                        <FolderPlus size={14} />
                      </button>
                    )}
                    {(brand.instagram || brand.facebook) && (
                      <button
                        type="button"
                        onClick={() => setDiagnosticsAccountId((brand.instagram ?? brand.facebook)?.id ?? "")}
                        aria-label={`Diagnóstico de ${brand.name}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-[#101014] text-muted hover:bg-card-hover hover:text-foreground"
                        title="Diagnóstico da conexão"
                      >
                        <Stethoscope size={14} />
                      </button>
                    )}
                    {(brand.instagram || brand.facebook) && (
                      <button
                        type="button"
                        onClick={() => handleDisconnect((brand.instagram ?? brand.facebook)?.id ?? "")}
                        disabled={busyId === (brand.instagram ?? brand.facebook)?.id}
                        aria-label={`Desconectar ${brand.name}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-[#101014] text-muted hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40"
                      >
                        <Unlink size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Mais ações para ${brand.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-[#101014] text-muted hover:bg-card-hover"
                    >
                      <MoreVertical size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </AppCard>
        </div>

        <aside className="space-y-5">
          <AppCard className="p-5">
            <p className="text-sm font-semibold text-foreground">Resumo geral</p>
            <div className="mt-5 flex items-center gap-5">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-[10px] border-accent/80 bg-accent/10 text-center">
                <span>
                  <span className="block text-2xl font-bold text-foreground">{accounts.length}</span>
                  <span className="text-xs text-muted">Contas</span>
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full bg-emerald-400" />Ativas <span className="ml-auto text-foreground">{activeCount}</span></div>
                <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full bg-amber-400" />Com problemas <span className="ml-auto text-foreground">{problemCount}</span></div>
                <div className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full bg-red-400" />Desconectadas <span className="ml-auto text-foreground">0</span></div>
              </div>
            </div>
          </AppCard>

          <AppCard className="p-5">
            <p className="text-sm font-semibold text-foreground">Conexões por plataforma</p>
            {[
              ["Instagram", instagramAccounts.length, "bg-pink-500"],
              ["TikTok", 0, "bg-cyan-400"],
              ["Facebook", facebookAccounts.length, "bg-blue-500"],
            ].map(([label, count, color]) => (
              <div key={label as string} className="mt-4">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-foreground">{label}</span>
                  <span className="text-muted">{count} / {Math.max(count as number, 1)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${color}`} style={{ width: count ? "100%" : "0%" }} />
                </div>
              </div>
            ))}
          </AppCard>

          <AppCard>
            <div className="border-b border-border px-4 py-4 text-sm font-semibold text-foreground">Ações rápidas</div>
            <div className="p-2">
              <div className="flex items-center gap-3 rounded-lg p-3 text-muted"><PlatformIcon platform="TIKTOK" /><span className="text-sm font-semibold">Conectar TikTok</span></div>
              <a href="/api/meta/auth" className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/[0.04]"><PlatformIcon platform="FACEBOOK" /><span className="text-sm font-semibold text-foreground">Conectar Facebook</span></a>
              <a href="/configuracoes" className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/[0.04]"><AlertTriangle size={20} className="text-[#9B8CFF]" /><span className="text-sm font-semibold text-foreground">Gerenciar integrações</span></a>
            </div>
          </AppCard>
        </aside>
      </div>

      {sessionId && <DiscoveryPicker sessionId={sessionId} onConnected={refresh} />}
      {diagnosticsAccountId && (
        <ConnectionDiagnosticsModal
          accountId={diagnosticsAccountId}
          onClose={() => {
            setDiagnosticsAccountId(null);
            void refresh();
          }}
        />
      )}
      {busyId && <span className="sr-only">Atualizando {busyId}</span>}
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
