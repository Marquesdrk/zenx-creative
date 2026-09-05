"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, HardDrive, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { BEST_TIME_SLOTS, pickTimeSlots, planSchedule } from "@/lib/scheduling/plan";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

type DriveFile = { id: string; name: string; createdTime: string | null };

const TIME_SLOTS_STORAGE_KEY = "zenx:bulk-schedule-time-slots";
const MAX_CUSTOM_SLOTS = 12;

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function loadStoredTimeSlots(): string[] {
  if (typeof window === "undefined") return BEST_TIME_SLOTS;
  try {
    const raw = window.localStorage.getItem(TIME_SLOTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v)) && parsed.length > 0) {
      return [...parsed].sort();
    }
  } catch {
    // ignora storage corrompido — cai no padrão
  }
  return BEST_TIME_SLOTS;
}

/** Agendamento automático em massa: em vez de escolher vídeo por vídeo, o usuário escolhe uma
 *  conta e quantos vídeos por dia — o sistema conta quantos vídeos ainda não usados existem na
 *  pasta de agendados dessa conta no Drive (a mesma que "Enviar ao Drive" no Editor em massa
 *  alimenta) e distribui todos nos horários escolhidos abaixo (editáveis, com os "melhores
 *  horários" como sugestão inicial). Os horários ficam salvos neste navegador. */
export function BulkScheduleComposer({
  accounts,
  onCreated,
}: {
  accounts: PublicSocialAccount[];
  onCreated: () => void;
}) {
  const instagramAccounts = useMemo(
    () => accounts.filter((a) => a.status === "connected" && a.platform === "INSTAGRAM"),
    [accounts]
  );
  const [socialAccountId, setSocialAccountId] = useState<string>("");
  // Lazy initializer em vez de useEffect: só roda uma vez, no primeiro render, e o
  // localStorage só existe no client mesmo (loadStoredTimeSlots cai no padrão durante SSR).
  const [timeSlots, setTimeSlots] = useState<string[]>(() => loadStoredTimeSlots());
  const [newSlotTime, setNewSlotTime] = useState("12:00");
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Não guarda um "videosPerDay clamped" separado em estado — só deriva na hora de usar,
  // então nunca fica dessincronizado do número real de horários cadastrados.
  const maxVideosPerDay = Math.max(1, timeSlots.length);
  const effectiveVideosPerDay = Math.min(videosPerDay, maxVideosPerDay);

  const refreshFiles = useCallback(async (accountId: string) => {
    if (!accountId) {
      setFiles(null);
      return null;
    }
    setLoadingFiles(true);
    setFilesError(null);
    try {
      const res = await fetch(`/api/drive/folder-files?socialAccountId=${accountId}`);
      const data = await res.json().catch(() => ({}) as { error?: string; files?: DriveFile[] });
      if (!res.ok) throw new Error(data.error || "Falha ao listar vídeos do Drive.");
      const nextFiles = (data.files as DriveFile[]) ?? [];
      setFiles(nextFiles);
      return nextFiles;
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : "Falha ao listar vídeos do Drive.");
      setFiles(null);
      return null;
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshFiles(socialAccountId);
    })();
  }, [socialAccountId, refreshFiles]);

  function addTimeSlot() {
    if (!/^\d{2}:\d{2}$/.test(newSlotTime)) return;
    if (timeSlots.includes(newSlotTime) || timeSlots.length >= MAX_CUSTOM_SLOTS) return;
    const next = [...timeSlots, newSlotTime].sort();
    setTimeSlots(next);
    window.localStorage.setItem(TIME_SLOTS_STORAGE_KEY, JSON.stringify(next));
  }

  function removeTimeSlot(slot: string) {
    if (timeSlots.length <= 1) return;
    const next = timeSlots.filter((s) => s !== slot);
    setTimeSlots(next);
    window.localStorage.setItem(TIME_SLOTS_STORAGE_KEY, JSON.stringify(next));
  }

  function resetTimeSlots() {
    setTimeSlots(BEST_TIME_SLOTS);
    window.localStorage.removeItem(TIME_SLOTS_STORAGE_KEY);
  }

  const preview = useMemo(() => {
    if (!files || files.length === 0) return null;
    const schedule = planSchedule(files.length, effectiveVideosPerDay, new Date(), timeSlots);
    return {
      first: schedule[0],
      last: schedule[schedule.length - 1],
      days: Math.ceil(files.length / effectiveVideosPerDay),
    };
  }, [files, effectiveVideosPerDay, timeSlots]);

  async function handleSchedule() {
    if (!socialAccountId) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    setProgressLabel("Conferindo vídeos disponíveis…");

    // Reconfere a pasta na hora de agendar em vez de confiar na lista carregada quando a conta
    // foi selecionada — se novos vídeos chegaram ao Drive nesse meio tempo (ex.: um lote grande
    // subindo em segundo plano no Editor), essa lista antiga ficaria desatualizada e o
    // agendamento sairia menor do que o esperado.
    const freshFiles = await refreshFiles(socialAccountId);
    if (!freshFiles || freshFiles.length === 0) {
      setSubmitError(filesError || "Nenhum vídeo disponível na pasta desta conta no momento.");
      setSubmitting(false);
      setProgressLabel(null);
      return;
    }

    const schedule = planSchedule(freshFiles.length, effectiveVideosPerDay, new Date(), timeSlots);

    try {
      for (let i = 0; i < freshFiles.length; i += 1) {
        setProgressLabel(`Agendando ${i + 1}/${freshFiles.length}`);
        const res = await fetch("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoSource: "drive",
            driveFileId: freshFiles[i].id,
            driveFileName: freshFiles[i].name,
            caption,
            scheduledAt: schedule[i].toISOString(),
            socialAccountIds: [socialAccountId],
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(data.error || `Falha ao agendar "${freshFiles[i].name}".`);
        }
      }
      setSuccessMessage(`${freshFiles.length} vídeo(s) agendado(s) com sucesso.`);
      setFiles([]);
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Falha ao agendar os vídeos.");
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  const slots = pickTimeSlots(effectiveVideosPerDay, timeSlots);

  return (
    <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles size={15} className="text-accent" />
        Agendamento automático em massa
      </p>
      <p className="mt-1 text-xs text-muted">
        Escolha a conta e quantos vídeos por dia — o sistema conta os vídeos disponíveis na pasta
        de agendados dessa conta no Drive e distribui todos nos horários escolhidos abaixo.
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Conta</p>
        {instagramAccounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            Nenhuma conta do Instagram conectada.
          </p>
        ) : (
          <select
            value={socialAccountId}
            onChange={(event) => setSocialAccountId(event.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-[#171717] px-3 text-xs text-foreground"
          >
            <option value="">Selecione uma conta…</option>
            {instagramAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.accountName}
                {account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Horários de publicação</p>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-[#171717] p-2">
          {timeSlots.map((slot) => (
            <span key={slot} className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-foreground">
              {slot}
              <button
                type="button"
                onClick={() => removeTimeSlot(slot)}
                disabled={timeSlots.length <= 1}
                className="text-muted hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Remover horário ${slot}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            type="time"
            value={newSlotTime}
            onChange={(event) => setNewSlotTime(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={addTimeSlot}
            disabled={timeSlots.length >= MAX_CUSTOM_SLOTS || timeSlots.includes(newSlotTime)}
            className="h-7 rounded-md border border-border px-2 text-xs font-semibold text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Adicionar
          </button>
          <button
            type="button"
            onClick={resetTimeSlots}
            title="Voltar aos horários sugeridos"
            className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted hover:text-foreground"
          >
            <RotateCw size={11} />
            Restaurar sugeridos
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase text-muted">
          Vídeos por dia
          <span className="normal-case text-gray-400">horários usados: {slots.join(", ")}</span>
        </p>
        <input
          type="range"
          min={1}
          max={maxVideosPerDay}
          value={effectiveVideosPerDay}
          onChange={(event) => setVideosPerDay(Number(event.target.value))}
          className="w-full accent-accent"
        />
        <p className="mt-1 text-xs text-gray-300">{effectiveVideosPerDay} vídeo(s) por dia</p>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Descrição enviada com os vídeos</p>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={3}
          placeholder="Escreva a legenda que vai junto de cada vídeo deste lote…"
          className="w-full resize-none rounded-lg border border-border bg-background p-2.5 text-sm text-foreground"
        />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-gray-300">
        <HardDrive size={14} className="shrink-0 text-muted" />
        <span className="flex-1">
          {!socialAccountId
            ? "Escolha uma conta para ver quantos vídeos estão disponíveis no Drive."
            : loadingFiles
              ? "Contando vídeos disponíveis…"
              : filesError
                ? <span className="text-red-300">{filesError}</span>
                : `${files?.length ?? 0} vídeo(s) disponível(is) na pasta desta conta.`}
        </span>
        {socialAccountId && (
          <button
            type="button"
            onClick={() => void refreshFiles(socialAccountId)}
            disabled={loadingFiles}
            title="Recontar vídeos disponíveis no Drive agora"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            <RotateCw size={11} className={loadingFiles ? "animate-spin" : undefined} />
            Atualizar
          </button>
        )}
      </div>

      {preview && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-gray-300">
          <CalendarRange size={14} className="shrink-0 text-muted" />
          {files?.length} vídeo(s) · de {formatDateTime(preview.first)} até {formatDateTime(preview.last)}, em ~{preview.days} dia(s).
        </div>
      )}

      {submitError && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{submitError}</p>}
      {successMessage && <p className="mt-3 rounded-lg bg-[#4CD18A]/10 p-2 text-xs text-[#4CD18A]">{successMessage}</p>}

      <button
        type="button"
        onClick={handleSchedule}
        disabled={submitting || !socialAccountId || !files || files.length === 0}
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-xs font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {submitting && progressLabel ? progressLabel : `Agendar ${files?.length ?? 0} vídeo(s)`}
      </button>
    </div>
  );
}
