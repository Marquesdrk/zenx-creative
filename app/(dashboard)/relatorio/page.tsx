"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CalendarRange,
  Clock3,
  Download,
  RefreshCw,
  UserRound,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PerformanceSkeleton } from "@/components/skeletons/performance-skeleton";
import type { ContentCoverageReport } from "@/lib/reports/content-coverage";

function formatDate(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}

function downloadCsv(report: ContentCoverageReport) {
  const header = ["Perfil", "Tipo", "@", "Conta(s)", "Vídeos publicados", "Vídeos agendados", "Próxima publicação", "Fim da fila", "Dias até o fim", "Agendamentos vencidos"];
  const rows = report.profiles.map((profile) => [
    profile.profileName,
    profile.engine,
    profile.handle ?? "",
    profile.accounts.map((account) => `${account.name} (${account.connected ? "conectada" : "desconectada"})`).join("; "),
    profile.publishedVideos,
    profile.scheduledVideos,
    profile.nextScheduledAt ? formatDate(profile.nextScheduledAt, { hour: "2-digit", minute: "2-digit" }) : "",
    profile.lastScheduledAt ? formatDate(profile.lastScheduledAt) : "",
    profile.daysUntilEnd ?? "",
    profile.overdueVideos,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-conteudo-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchCoverageReport() {
  const response = await fetch("/api/relatorio", { cache: "no-store" });
  const payload = (await response.json()) as ContentCoverageReport | { error?: string };
  if (!response.ok) throw new Error("error" in payload ? payload.error : "Falha ao carregar o relatório.");
  return payload as ContentCoverageReport;
}

export default function RelatorioPage() {
  const [report, setReport] = useState<ContentCoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setReport(await fetchCoverageReport());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o relatório.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchCoverageReport()
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar o relatório.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    if (!report) return { published: 0, scheduled: 0, profilesWithQueue: 0, overdue: 0 };
    return report.profiles.reduce(
      (sum, profile) => ({
        published: sum.published + profile.publishedVideos,
        scheduled: sum.scheduled + profile.scheduledVideos,
        profilesWithQueue: sum.profilesWithQueue + Number(profile.scheduledVideos > 0),
        overdue: sum.overdue + profile.overdueVideos,
      }),
      { published: 0, scheduled: 0, profilesWithQueue: 0, overdue: 0 }
    );
  }, [report]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatório de conteúdo</h1>
          <p className="mt-1 text-sm text-muted">
            Acompanhe, em um card separado, o histórico e a fila de cada perfil.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => report && downloadCsv(report)}
            disabled={!report || loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-background disabled:opacity-50"
          >
            <Download size={15} />
            Exportar CSV
          </button>
        </div>
      </div>
      <p className="mb-6 text-xs text-muted">
        Publicados = vídeos com publicação concluída. Agendados = vídeos únicos, sem duplicar quando vão para mais de uma rede. Datas no fuso de Brasília.
        Todos os perfis cadastrados aparecem porque o sistema ainda não possui opção para desativar um perfil.
      </p>

      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <PerformanceSkeleton />
      ) : report ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={BadgeCheck} label="Vídeos publicados" value={totals.published.toLocaleString("pt-BR")} tone="emerald" />
            <SummaryCard icon={Video} label="Vídeos na fila" value={totals.scheduled.toLocaleString("pt-BR")} />
            <SummaryCard icon={CalendarRange} label="Perfis com conteúdo" value={`${totals.profilesWithQueue} / ${report.profiles.length}`} />
            <SummaryCard icon={Clock3} label="Agendamentos vencidos" value={totals.overdue.toLocaleString("pt-BR")} tone={totals.overdue > 0 ? "amber" : "default"} />
          </div>

          {report.unmatchedScheduledVideos > 0 && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {report.unmatchedScheduledVideos} vídeo(s) agendado(s) estão em contas sem um perfil correspondente
              {report.unmatchedAccounts.length > 0 ? `: ${report.unmatchedAccounts.join(", ")}.` : "."}
              Confira se o @handle do perfil corresponde ao usuário da conta conectada.
            </div>
          )}

          {report.profiles.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted">
              Nenhum perfil cadastrado. Crie um perfil no Editor em massa para começar a acompanhar sua fila.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {report.profiles.map((profile) => (
                <article key={profile.profileId} className="group relative overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-accent/50">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProfileCardAvatar key={profile.profilePictureUrl ?? "empty"} src={profile.profilePictureUrl} name={profile.profileName} />
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-foreground">{profile.profileName}</h2>
                          <p className="mt-0.5 truncate text-sm text-muted">
                            {profile.handle ? (profile.handle.startsWith("@") ? profile.handle : `@${profile.handle}`) : "@ sem usuário"}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {profile.engine.replace("_", " ")}
                      </span>
                    </div>

                    <div className="mt-4 flex min-h-7 flex-wrap items-center gap-2">
                      {profile.accounts.length ? profile.accounts.map((account) => (
                        <span key={account.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${account.connected ? "bg-emerald-400" : "bg-amber-400"}`} />
                          <span className="truncate">{account.name} · {account.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}</span>
                        </span>
                      )) : (
                        <span className="text-xs text-muted">Nenhuma conta vinculada</span>
                      )}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <MetricBlock icon={BadgeCheck} label="Já postados" value={profile.publishedVideos} tone="emerald" />
                      <MetricBlock icon={CalendarDays} label="Agendados" value={profile.scheduledVideos} tone="violet" />
                    </div>

                    <div className="mt-4 rounded-xl border border-border/80 bg-background/50 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Tem vídeo até</div>
                          <div className="mt-1 truncate text-lg font-semibold text-foreground">
                            {profile.lastScheduledAt ? formatDate(profile.lastScheduledAt) : "Sem vídeos na fila"}
                          </div>
                        </div>
                        {profile.daysUntilEnd !== null && (
                          <div className="shrink-0 rounded-lg bg-accent/10 px-2.5 py-2 text-right text-xs font-medium text-accent">
                            {profile.daysUntilEnd < 0
                              ? `${Math.abs(profile.daysUntilEnd)} dia(s) vencido`
                              : profile.daysUntilEnd === 0
                                ? "Termina hoje"
                                : `${profile.daysUntilEnd} dia(s)`}
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted"><Clock3 size={13} /> Próximo agendamento</span>
                        <span className="font-medium text-foreground">
                          {formatDate(profile.nextScheduledAt, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {profile.overdueVideos > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-300">
                        <AlertTriangle size={13} /> {profile.overdueVideos} vídeo(s) com horário de agendamento vencido
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Atualizado em {formatDate(report.generatedAt, { hour: "2-digit", minute: "2-digit" })}.</p>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "violet" | "emerald" | "amber" | "default";
}) {
  const toneClass = {
    violet: "bg-accent/10 text-accent",
    emerald: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    default: "bg-card-hover text-muted",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
        <Icon size={19} />
      </span>
      <div>
        <div className="text-xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

function MetricBlock({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "emerald" | "violet";
}) {
  const toneClass = tone === "emerald"
    ? "bg-emerald-500/10 text-emerald-400"
    : "bg-accent/10 text-accent";
  return (
    <div className="rounded-xl border border-border/80 bg-background/40 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}><Icon size={15} /></span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function ProfileCardAvatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");
  return (
    <div
      role="img"
      aria-label={src && !failed ? `Foto de ${name}` : `${name}, sem foto disponível`}
      title={src && failed ? "Reconecte a conta ou envie uma foto nas Configurações" : undefined}
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/10 text-accent ring-2 ring-accent/20"
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL da Meta atualizada pelo endpoint local
        <img src={src} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="text-base font-semibold tracking-wide">{initials || <UserRound size={23} />}</span>
      )}
    </div>
  );
}
