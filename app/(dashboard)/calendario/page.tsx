"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Filter, Folder, Play, Plus } from "lucide-react";
import { VideoFrame } from "@/components/editor/video-frame";
import { Topbar } from "@/components/shell/topbar";
import { AppCard } from "@/components/ui/app-card";
import { BrandSwitcher, type BrandOption } from "@/components/ui/brand-switcher";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useProfiles } from "@/lib/editor/profiles-store";
import { PLATFORM_LABELS, type Batch, type BatchItem, type Platform, type Publication } from "@/lib/editor/types";

const AUTOPOST_PLATFORMS: Platform[] = ["INSTAGRAM", "TIKTOK", "FACEBOOK"];

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusLabel(publication: Publication) {
  if (publication.status === "PUBLISHED") return "Publicado";
  if (publication.status === "FAILED") return "Erro";
  return publication.scheduledAt ? "Agendado" : "Pendente";
}

function monthDays(anchor: Date) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function brandHandle(name: string) {
  return `@${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "")}`;
}

export default function CalendarioPage() {
  const [profiles] = useProfiles();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [scheduleByItem, setScheduleByItem] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [defaultSchedule] = useState(() => toDatetimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [brandId, setBrandId] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<Platform | "ALL">("ALL");

  const refresh = useCallback(async () => {
    const [batchRes, publicationRes] = await Promise.all([fetch("/api/batches"), fetch("/api/publications")]);
    if (batchRes.ok) {
      const data = (await batchRes.json()) as { batches: Batch[]; items: BatchItem[] };
      setBatches(data.batches);
      setItems(data.items);
    }
    if (publicationRes.ok) {
      setPublications((await publicationRes.json()) as Publication[]);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  const brands: BrandOption[] = profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    handle: profile.engine === "X_STYLE" ? profile.handle : brandHandle(profile.name),
    status: "ativa",
  }));

  const completedItems = useMemo(() => items.filter((item) => item.status === "COMPLETED"), [items]);

  const events = useMemo(() => {
    return publications
      .map((publication) => {
        const item = items.find((candidate) => candidate.id === publication.batchItemId);
        const batch = item ? batches.find((candidate) => candidate.id === item.batchId) : null;
        const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
        if (!item || !batch || !profile) return null;
        const date = publication.scheduledAt ? new Date(publication.scheduledAt) : new Date(publication.createdAt);
        return { publication, item, batch, profile, date };
      })
      .filter((event): event is NonNullable<typeof event> => Boolean(event))
      .filter((event) => brandId === "ALL" || event.profile.id === brandId)
      .filter((event) => platformFilter === "ALL" || event.publication.platform === platformFilter);
  }, [batches, brandId, items, platformFilter, profiles, publications]);

  const nextPosts = [...events].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(currentMonth);
  const days = monthDays(currentMonth);
  const monthEvents = events.filter((event) => event.date.getMonth() === currentMonth.getMonth());
  const pending = events.filter((event) => event.publication.status === "PENDING").length;
  const published = events.filter((event) => event.publication.status === "PUBLISHED").length;

  async function schedulePublication(item: BatchItem, platform: Platform, publishNow = false) {
    const key = `${item.id}:${platform}`;
    setBusyKey(key);
    const scheduledAt = publishNow ? null : scheduleByItem[item.id] || defaultSchedule;
    const res = await fetch("/api/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchItemId: item.id, platform, scheduledAt }),
    });
    setBusyKey(null);
    if (res.ok) await refresh();
  }

  async function runDue() {
    setBusyKey("run-due");
    await fetch("/api/publications/run-due", { method: "POST" });
    setBusyKey(null);
    await refresh();
  }

  return (
    <div>
      <Topbar
        searchPlaceholder="Buscar vídeos..."
        action={
          <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 text-sm font-semibold text-white">
            <Plus size={16} />
            Novo lote
          </button>
        }
      />
      <PageHeader title="Calendário" description="Visualize e gerencie todos os agendamentos de posts em um só lugar." />

      <AppCard className="mt-6 p-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="mb-2 text-xs font-semibold text-[#9B8CFF]">Marca atual</p>
            <BrandSwitcher brands={brands} value={brandId} onChange={setBrandId} allowAll />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold text-[#9B8CFF]">Contas conectadas desta marca ({AUTOPOST_PLATFORMS.length})</p>
            <div className="flex flex-wrap gap-3">
              {AUTOPOST_PLATFORMS.map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => setPlatformFilter(platformFilter === platform ? "ALL" : platform)}
                  className={`flex min-w-[150px] items-center gap-3 rounded-lg border p-3 text-left transition ${
                    platformFilter === platform ? "border-accent/70 bg-accent/10" : "border-border bg-[#101014] hover:bg-card-hover"
                  }`}
                >
                  <PlatformIcon platform={platform} />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{PLATFORM_LABELS[platform]}</span>
                    <span className="block text-xs text-muted">conectado</span>
                  </span>
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={runDue} disabled={busyKey === "run-due"} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-[#101014] px-4 text-sm font-semibold text-foreground hover:bg-card-hover disabled:opacity-50">
            <Play size={15} />
            Rodar pendentes
          </button>
        </div>
      </AppCard>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentMonth(new Date())} className="h-9 rounded-lg border border-border bg-card px-4 text-sm text-foreground">Hoje</button>
              <button type="button" onClick={() => setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))} className="h-9 w-9 rounded-lg border border-border bg-card text-muted">‹</button>
              <button type="button" onClick={() => setCurrentMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))} className="h-9 w-9 rounded-lg border border-border bg-card text-muted">›</button>
              <h2 className="ml-2 text-xl font-bold capitalize text-foreground">{monthLabel}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                <Filter size={15} />
                Filtros
              </button>
              <div className="flex rounded-lg border border-border bg-card p-1">
                {["Mês", "Semana", "Agenda"].map((label) => (
                  <button key={label} type="button" className={`rounded-md px-4 py-2 text-xs font-semibold ${label === "Mês" ? "bg-accent/30 text-white" : "text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AppCard className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border text-center text-[11px] font-semibold uppercase text-muted">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <div key={day} className="border-r border-border px-3 py-3 last:border-r-0">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = events.filter((event) => sameDay(event.date, day));
                const inMonth = day.getMonth() === currentMonth.getMonth();
                const isToday = sameDay(day, new Date());
                return (
                  <div key={day.toISOString()} className={`min-h-28 border-b border-r border-border p-3 last:border-r-0 ${inMonth ? "bg-card/40" : "bg-background/40 text-muted/50"} ${isToday ? "ring-1 ring-inset ring-accent/70" : ""}`}>
                    <div className={`text-sm font-semibold ${inMonth ? "text-foreground" : "text-muted/50"}`}>{day.getDate()}</div>
                    <div className="mt-3 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div key={event.publication.id} className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs text-foreground">
                          <PlatformIcon platform={event.publication.platform} size="sm" />
                          <span>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(event.date)}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && <span className="text-xs text-[#9B8CFF]">+{dayEvents.length - 3}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </AppCard>

          {completedItems.length > 0 && (
            <AppCard className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Vídeos prontos para agendar</p>
                  <p className="text-xs text-muted">{completedItems.length} vídeo(s) renderizado(s)</p>
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {completedItems.slice(0, 8).map((item) => {
                  const batch = batches.find((candidate) => candidate.id === item.batchId);
                  const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
                  if (!profile) return null;
                  const value = scheduleByItem[item.id] || defaultSchedule;
                  return (
                    <article key={item.id} className="rounded-lg border border-border bg-[#101014] p-3">
                      <p className="truncate text-xs font-semibold text-foreground">{item.filename}</p>
                      <input type="datetime-local" value={value} onChange={(event) => setScheduleByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground" />
                      <div className="mt-3 grid grid-cols-3 gap-1.5">
                        {AUTOPOST_PLATFORMS.map((platform) => (
                          <button key={platform} type="button" onClick={() => schedulePublication(item, platform)} disabled={busyKey === `${item.id}:${platform}`} className="h-8 rounded-md border border-border text-[11px] text-foreground hover:bg-card-hover disabled:opacity-50">
                            {PLATFORM_LABELS[platform]}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </AppCard>
          )}
        </div>

        <aside className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <StatCard icon={CalendarDays} value={monthEvents.length} label="Posts agendados" />
            <StatCard icon={CheckCircle2} value={published} label="Concluídos" tone="green" />
            <StatCard icon={Clock3} value={pending} label="Pendentes" tone="amber" />
            <StatCard icon={Folder} value={batches.length} label="Lotes ativos" />
          </div>
          <AppCard>
            <div className="border-b border-border px-4 py-4 text-sm font-semibold text-foreground">Próximos posts</div>
            <div className="space-y-2 p-3">
              {nextPosts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">Nenhum post agendado para este período.</div>
              ) : (
                nextPosts.map((event) => (
                  <div key={event.publication.id} className="flex items-center gap-3 rounded-lg border border-border bg-[#101014] p-3">
                    <div className="w-14">
                      <VideoFrame profile={event.profile} title={event.item.manualOverrides.title} caption={event.item.manualOverrides.caption} contentUrl={event.item.renderedUrl ?? event.item.contentUrl} contentCrop={event.item.manualOverrides.crop} contentZoom={event.item.manualOverrides.zoom} contentFit={event.item.manualOverrides.fit} contentRotation={event.item.manualOverrides.rotation} watermarkPosition={event.item.manualOverrides.watermarkPosition} xStyleVideoFrame={event.item.manualOverrides.xStyleVideoFrame} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <PlatformIcon platform={event.publication.platform} size="sm" />
                        {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(event.date)}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-foreground">{event.profile.name}</p>
                      <StatusBadge tone={event.publication.status === "FAILED" ? "danger" : event.publication.status === "PUBLISHED" ? "success" : "idle"}>{statusLabel(event.publication)}</StatusBadge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AppCard>
        </aside>
      </div>
    </div>
  );
}
