"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Filter, Grid2X2, HardDrive, List, Loader2, MoreVertical, Pencil, Search, Trash2 } from "lucide-react";
import { VideoFrame } from "./video-frame";
import { AppCard } from "@/components/ui/app-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { computeBatchStatus, ENGINE_LABELS } from "@/lib/editor/types";
import type { Batch, BatchItem, BatchStatus, Profile } from "@/lib/editor/types";

type BatchFilter = "ALL" | "AWAITING_REVIEW" | "PROCESSING" | "COMPLETED" | "SCHEDULED";
type SortMode = "recent" | "old";
type ViewMode = "list" | "grid";

const PAGE_SIZE = 12;

const STATUS_LABELS: Record<BatchStatus | "SCHEDULED", string> = {
  IMPORTING: "Importando",
  ANALYZING: "Analisando",
  AWAITING_REVIEW: "Aguardando revisão",
  PROCESSING: "Renderizando",
  PARTIALLY_COMPLETED: "Parcial",
  COMPLETED: "Concluído",
  FAILED: "Erro",
  SCHEDULED: "Agendado",
};

function statusTone(status: BatchStatus | "SCHEDULED") {
  if (status === "COMPLETED") return "success";
  if (status === "PROCESSING" || status === "IMPORTING" || status === "ANALYZING") return "working";
  if (status === "FAILED") return "danger";
  if (status === "SCHEDULED") return "warning";
  return "idle";
}

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function batchDescription(batchItems: BatchItem[]) {
  const firstCaption = batchItems.find((item) => item.manualOverrides.caption)?.manualOverrides.caption;
  return firstCaption || "Lote preparado para edição e exportação";
}

function batchResolution(batchItems: BatchItem[]) {
  const analysis = batchItems.find((item) => item.sourceAnalysis)?.sourceAnalysis;
  return analysis ? `${analysis.width}x${analysis.height}` : "1080x1920";
}

function progressLabel(batchItems: BatchItem[]) {
  const completed = batchItems.filter((item) => item.status === "COMPLETED").length;
  if (batchItems.length === 0) return 0;
  return Math.round((completed / batchItems.length) * 100);
}

function BatchPreview({ item, profile }: { item: BatchItem | null; profile: Profile }) {
  if (!item) return <div className="h-16 w-28 rounded-md bg-white/[0.04]" />;
  return (
    <div className="h-16 w-28 overflow-hidden rounded-md bg-black">
      <div className="mx-auto w-9">
        <VideoFrame
          profile={profile}
          title={item.manualOverrides.title}
          caption={item.manualOverrides.caption}
          contentUrl={item.renderedUrl ?? item.contentUrl}
          contentCropBox={item.manualOverrides.cropBox}
          contentCropZoom={item.manualOverrides.cropZoom}
          contentFit={item.manualOverrides.fit}
          contentRotation={item.manualOverrides.rotation}
          contentSourceTrim={item.manualOverrides.sourceTrim}
          watermarkPosition={item.manualOverrides.watermarkPosition}
          xStyleVideoFrame={item.manualOverrides.xStyleVideoFrame}
          reactionMediaUrl={
            profile.engine === "REACT"
              ? (profile.reactionMedia.find((r) => r.id === item.manualOverrides.reactionMediaId)?.url ?? null)
              : null
          }
        />
      </div>
    </div>
  );
}

export function VideoGrid({
  items,
  batches,
  profiles,
  onEdit,
  onDeleteItem,
  onConfirmBatch,
  onExportBatch,
  onSendToDrive,
  exportingBatchId,
  exportProgressLabel,
}: {
  items: BatchItem[];
  batches: Batch[];
  profiles: Profile[];
  onEdit: (item: BatchItem) => void;
  onDeleteItem: (item: BatchItem) => void;
  onConfirmBatch: (batchId: string) => void;
  onExportBatch: (batchId: string) => void;
  onSendToDrive: (batchId: string) => void;
  exportingBatchId: string | null;
  exportProgressLabel?: string | null;
}) {
  const [filter, setFilter] = useState<BatchFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("recent");
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return batches
      .map((batch) => {
        const batchItems = items.filter((item) => item.batchId === batch.id);
        const profile = profiles.find((candidate) => candidate.id === batch.profileId);
        if (!profile || batchItems.length === 0) return null;
        const status = computeBatchStatus(batchItems);
        return { batch, batchItems, profile, status, firstItem: batchItems[0] };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => filter === "ALL" || row.status === filter)
      .filter((row) => {
        if (!normalizedQuery) return true;
        return (
          row.profile.name.toLowerCase().includes(normalizedQuery) ||
          row.batchItems.some((item) => item.filename.toLowerCase().includes(normalizedQuery))
        );
      })
      .sort((a, b) =>
        sort === "recent"
          ? new Date(b.batch.createdAt).getTime() - new Date(a.batch.createdAt).getTime()
          : new Date(a.batch.createdAt).getTime() - new Date(b.batch.createdAt).getTime()
      );
  }, [batches, filter, items, profiles, query, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleFrom = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const visibleTo = Math.min(page * PAGE_SIZE, rows.length);

  const filters: Array<[BatchFilter, string, number]> = [
    ["ALL", "Todos", rows.length],
    ["AWAITING_REVIEW", "Aguardando revisão", items.filter((item) => item.status === "AWAITING_REVIEW").length],
    ["PROCESSING", "Renderizando", items.filter((item) => item.status === "PROCESSING").length],
    ["COMPLETED", "Concluídos", items.filter((item) => item.status === "COMPLETED").length],
    ["SCHEDULED", "Agendados", 0],
  ];

  if (items.length === 0) {
    return (
      <AppCard className="flex h-64 flex-col items-center justify-center border-dashed text-center">
        <p className="text-sm font-semibold text-foreground">Nenhum lote encontrado</p>
        <p className="mt-2 text-sm text-muted">Crie seu primeiro lote ou altere os filtros.</p>
      </AppCard>
    );
  }

  return (
    <div className="space-y-3">
      <AppCard className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {filters.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  filter === key ? "bg-accent/35 text-white" : "text-muted hover:bg-white/[0.04] hover:text-foreground"
                }`}
              >
                {label}
                <span className="ml-2 text-[11px] text-muted">{count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Buscar lote..."
                className="h-9 w-48 rounded-lg border border-border bg-[#101014] pl-9 pr-3 text-xs text-foreground placeholder:text-muted"
              />
            </label>
            <button type="button" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[#101014] px-3 text-xs font-semibold text-foreground hover:bg-card-hover">
              <Filter size={14} />
              Filtros
            </button>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-9 rounded-lg border border-border bg-[#101014] px-3 text-xs font-semibold text-foreground"
            >
              <option value="recent">Mais recentes</option>
              <option value="old">Mais antigos</option>
            </select>
            <div className="flex rounded-lg border border-border bg-[#101014] p-1">
              <button aria-label="Visualização em grid" type="button" onClick={() => setView("grid")} className={`flex h-7 w-8 items-center justify-center rounded-md ${view === "grid" ? "bg-accent/30 text-white" : "text-muted"}`}>
                <Grid2X2 size={14} />
              </button>
              <button aria-label="Visualização em lista" type="button" onClick={() => setView("list")} className={`flex h-7 w-8 items-center justify-center rounded-md ${view === "list" ? "bg-accent/30 text-white" : "text-muted"}`}>
                <List size={15} />
              </button>
            </div>
          </div>
        </div>
      </AppCard>

      <AppCard className="overflow-hidden">
        <div className="border-b border-border px-4 py-4 text-sm font-semibold text-foreground">
          Lotes de vídeos ({rows.length})
        </div>
        <div className={view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-3 p-3" : "overflow-x-auto"}>
          {view === "list" && (
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="border-b border-border text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lote</th>
                  <th className="px-4 py-3 font-semibold">Vídeos</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Criação</th>
                  <th className="px-4 py-3 font-semibold">Agendado para</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ batch, batchItems, firstItem, profile, status }) => {
                  const canConfirm = status === "AWAITING_REVIEW";
                  const completedCount = batchItems.filter((item) => item.status === "COMPLETED").length;
                  return (
                    <tr key={batch.id} className="border-b border-border/70 transition hover:bg-white/[0.025]">
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <BatchPreview item={firstItem} profile={profile} />
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">{profile.name}</p>
                            <p className="mt-0.5 text-xs text-muted">
                              {ENGINE_LABELS[batch.engine]} • {batchItems.length} vídeos • {batchResolution(batchItems)}
                            </p>
                            <p className="mt-1 max-w-[360px] truncate text-xs text-muted">{batchDescription(batchItems)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span className="font-bold">{batchItems.length}</span>
                        <p className="text-xs text-muted">vídeos</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={statusTone(status)}>{STATUS_LABELS[status]}</StatusBadge>
                          {status === "PROCESSING" && <span className="text-xs text-blue-300">{progressLabel(batchItems)}%</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {formatDate(batch.createdAt)}
                        <p className="text-xs text-muted">{formatTime(batch.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">-</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canConfirm && (
                            <button type="button" onClick={() => onConfirmBatch(batch.id)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white">
                              <CheckCircle2 size={14} />
                              Confirmar
                            </button>
                          )}
                          <button type="button" onClick={() => firstItem && onEdit(firstItem)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[#101014] px-3 text-xs font-semibold text-foreground hover:bg-card-hover">
                            <Pencil size={14} />
                            Revisar vídeos
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportBatch(batch.id)}
                            disabled={exportingBatchId === batch.id || completedCount === 0}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[#101014] px-3 text-xs font-semibold text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {exportingBatchId === batch.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            {exportingBatchId === batch.id && exportProgressLabel ? exportProgressLabel : "Exportar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSendToDrive(batch.id)}
                            disabled={completedCount === 0}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-[#101014] px-3 text-xs font-semibold text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <HardDrive size={14} />
                            Enviar ao Drive
                          </button>
                          <button type="button" aria-label="Mais ações" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-[#101014] text-muted hover:bg-card-hover">
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {view === "grid" &&
            pageRows.map(({ batch, batchItems, firstItem, profile, status }) => (
              <article key={batch.id} className="rounded-lg border border-border bg-[#101014] p-3">
                <div className="flex gap-3">
                  <BatchPreview item={firstItem} profile={profile} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{profile.name}</p>
                    <p className="mt-1 text-xs text-muted">{ENGINE_LABELS[batch.engine]} • {batchItems.length} vídeos</p>
                    <div className="mt-3">
                      <StatusBadge tone={statusTone(status)}>{STATUS_LABELS[status]}</StatusBadge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => firstItem && onEdit(firstItem)} className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white">
                    Revisar vídeos
                  </button>
                  <button type="button" onClick={() => onDeleteItem(firstItem)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-red-300">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      </AppCard>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>Mostrando {visibleFrom} a {visibleTo} de {rows.length} lotes</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-lg border border-border px-3 disabled:opacity-40">
            Anterior
          </button>
          <span className="rounded-lg bg-accent/25 px-3 py-2 text-white">{page}</span>
          <span>de {totalPages}</span>
          <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-8 rounded-lg border border-border px-3 disabled:opacity-40">
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
