"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Play, Send } from "lucide-react";
import { VideoFrame } from "@/components/editor/video-frame";
import { useProfiles } from "@/lib/editor/profiles-store";
import { PLATFORM_LABELS, type Batch, type BatchItem, type Platform, type Publication } from "@/lib/editor/types";

const AUTOPOST_PLATFORMS: Platform[] = ["INSTAGRAM", "FACEBOOK", "TIKTOK"];

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

export default function CalendarioPage() {
  const [profiles] = useProfiles();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [scheduleByItem, setScheduleByItem] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [defaultSchedule] = useState(() => toDatetimeLocal(new Date(Date.now() + 60 * 60_000)));

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

  const completedItems = useMemo(() => items.filter((item) => item.status === "COMPLETED"), [items]);

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
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calendário de postagem</h1>
          <p className="mt-1 text-sm text-muted">
            Programe vídeos renderizados para Instagram Reels, Facebook e TikTok.
          </p>
        </div>
        <button
          type="button"
          onClick={runDue}
          disabled={busyKey === "run-due"}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
        >
          <Play size={15} />
          Rodar pendentes
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-border bg-[#0d0d0d]">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Vídeos prontos para agendar</p>
            <p className="mt-0.5 text-xs text-muted">{completedItems.length} vídeo(s) renderizado(s)</p>
          </div>
          {completedItems.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted">
              Renderize e exporte um lote no editor para alimentar o calendário.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 p-4">
              {completedItems.map((item) => {
                const batch = batches.find((candidate) => candidate.id === item.batchId);
                const profile = batch ? profiles.find((candidate) => candidate.id === batch.profileId) : null;
                if (!profile) return null;
                const value = scheduleByItem[item.id] || defaultSchedule;
                return (
                  <article key={item.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="mx-auto max-w-[150px]">
                      <VideoFrame
                        profile={profile}
                        title={item.manualOverrides.title}
                        caption={item.manualOverrides.caption}
                        contentUrl={item.renderedUrl ?? item.contentUrl}
                        contentCropBox={item.manualOverrides.cropBox}
                        contentCropZoom={item.manualOverrides.cropZoom}
                        contentFit={item.manualOverrides.fit}
                        contentRotation={item.manualOverrides.rotation}
                        watermarkPosition={item.manualOverrides.watermarkPosition}
                        xStyleVideoFrame={item.manualOverrides.xStyleVideoFrame}
                      />
                    </div>
                    <p className="mt-3 truncate text-xs font-semibold text-foreground">{item.filename}</p>
                    <label className="mt-3 block text-[11px] font-semibold uppercase text-muted">
                      Data e hora
                      <input
                        type="datetime-local"
                        value={value}
                        onChange={(event) =>
                          setScheduleByItem((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        className="mt-1 w-full rounded-md border border-border bg-[#171717] px-2 py-1.5 text-xs normal-case text-foreground"
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      {AUTOPOST_PLATFORMS.map((platform) => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => schedulePublication(item, platform)}
                          disabled={busyKey === `${item.id}:${platform}`}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-[#171717] text-[11px] font-semibold text-gray-200 hover:bg-card-hover disabled:opacity-50"
                        >
                          <CalendarClock size={12} />
                          {PLATFORM_LABELS[platform]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => schedulePublication(item, "INSTAGRAM", true)}
                      className="mt-2 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-accent text-xs font-semibold text-background"
                    >
                      <Send size={13} />
                      Publicar agora no Instagram
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-border bg-[#0d0d0d]">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Fila de publicações</p>
            <p className="mt-0.5 text-xs text-muted">{publications.length} registro(s)</p>
          </div>
          <div className="max-h-[680px] overflow-y-auto p-3">
            {publications.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
                Nenhuma publicação agendada ainda.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {publications.map((publication) => {
                  const item = items.find((candidate) => candidate.id === publication.batchItemId);
                  return (
                    <div key={publication.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-foreground">
                          {PLATFORM_LABELS[publication.platform]}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            publication.status === "PUBLISHED"
                              ? "bg-[#4CD18A]/15 text-[#4CD18A]"
                              : publication.status === "FAILED"
                                ? "bg-red-500/15 text-red-300"
                                : "bg-accent/15 text-accent"
                          }`}
                        >
                          {statusLabel(publication)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">{item?.filename ?? publication.batchItemId}</p>
                      <p className="mt-2 text-[11px] text-gray-300">
                        {publication.scheduledAt
                          ? new Date(publication.scheduledAt).toLocaleString()
                          : "Publicação imediata"}
                      </p>
                      {publication.error && <p className="mt-2 text-[11px] text-red-300">{publication.error}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
