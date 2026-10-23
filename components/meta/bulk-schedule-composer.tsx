"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, HardDrive, Loader2, Minus, Plus, RotateCw, Sparkles, X } from "lucide-react";
import { BEST_TIME_SLOTS, pickTimeSlots, planSchedule } from "@/lib/scheduling/plan";
import type { PublicSocialAccount } from "@/lib/server/meta/types";
import { CoverImagePicker } from "@/components/meta/cover-image-picker";

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

/** Agendamento automático em massa: o usuário escolhe uma conta Instagram ou Página do
 *  Facebook e quantos vídeos por dia. Os arquivos vêm da pasta de agendados da conta no Drive;
 *  o primeiro é publicado imediatamente como teste e os demais seguem os horários escolhidos. */
export function BulkScheduleComposer({
  accounts,
  onCreated,
}: {
  accounts: PublicSocialAccount[];
  onCreated: () => void;
}) {
  const publishAccounts = useMemo(
    () => accounts.filter((a) => a.status === "connected" && (a.platform === "INSTAGRAM" || a.platform === "FACEBOOK" || a.platform === "YOUTUBE")),
    [accounts]
  );
  const [socialAccountId, setSocialAccountId] = useState<string>("");
  const selectedAccount = publishAccounts.find((account) => account.id === socialAccountId) ?? null;
  // Lazy initializer em vez de useEffect: só roda uma vez, no primeiro render, e o
  // localStorage só existe no client mesmo (loadStoredTimeSlots cai no padrão durante SSR).
  const [timeSlots, setTimeSlots] = useState<string[]>(() => loadStoredTimeSlots());
  const [newSlotTime, setNewSlotTime] = useState("12:00");
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [caption, setCaption] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
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
    const scheduledCount = Math.max(0, files.length - 1);
    const schedule = planSchedule(scheduledCount, effectiveVideosPerDay, new Date(), timeSlots);
    const fallbackDate = new Date();
    return {
      first: schedule[0] ?? fallbackDate,
      last: schedule[schedule.length - 1] ?? fallbackDate,
      days: Math.max(1, Math.ceil(scheduledCount / effectiveVideosPerDay)),
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

    const scheduledFiles = freshFiles.slice(1);
    const schedule = planSchedule(scheduledFiles.length, effectiveVideosPerDay, new Date(), timeSlots);

    try {
      let coverUrl: string | null = null;
      if (coverFile) {
        if (coverFile.size > 4 * 1024 * 1024) throw new Error("A capa deve ter no máximo 4 MB.");
        setProgressLabel("Enviando capa do lote…");
        const formData = new FormData();
        formData.append("file", coverFile);
        const coverRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!coverRes.ok) throw new Error("Falha ao enviar a capa do lote.");
        coverUrl = ((await coverRes.json()) as { url: string }).url;
      }
      for (let i = 0; i < freshFiles.length; i += 1) {
        setProgressLabel(i === 0 ? `Publicando teste 1/${freshFiles.length}` : `Agendando ${i + 1}/${freshFiles.length}`);
        const payload = {
          videoSource: "drive",
          driveFileId: freshFiles[i].id,
          driveFileName: freshFiles[i].name,
          caption,
          coverUrl,
          scheduledAt: i === 0 ? null : schedule[i - 1].toISOString(),
          socialAccountIds: [socialAccountId],
        };
        let lastError = `Falha ao agendar "${freshFiles[i].name}".`;
        let created = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const res = await fetch("/api/scheduled-posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}) as { error?: string; retryable?: boolean });
          if (res.ok) {
            created = true;
            break;
          }
          lastError = data.error || lastError;
          if ((!data.retryable && ![502, 503, 504].includes(res.status)) || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
        if (!created) throw new Error(lastError);
      }
      setSuccessMessage(`Teste publicado agora e ${scheduledFiles.length} vídeo(s) agendado(s) com sucesso.`);
      setFiles([]);
      setCoverFile(null);
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
        Escolha uma conta, defina a quantidade diária e os horários. O primeiro vídeo será publicado
        agora como teste; os demais seguirão o ritmo que você configurar.
      </p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Conta ou Página</p>
        {publishAccounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            Nenhuma conta do Instagram ou Página do Facebook conectada.
          </p>
        ) : (
          <select
            value={socialAccountId}
            onChange={(event) => setSocialAccountId(event.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-[#171717] px-3 text-xs text-foreground"
          >
            <option value="">Selecione uma conta…</option>
            {publishAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.platform === "FACEBOOK" ? "Página Facebook" : account.platform === "YOUTUBE" ? "Canal YouTube" : "Instagram"} · {account.accountName}
                {account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
              </option>
            ))}
          </select>
        )}
        {selectedAccount?.platform === "YOUTUBE" && (
          <p className="mt-1.5 text-[11px] text-muted">
            Os vídeos serão enviados como Shorts a este canal (vertical, até 60 s). A cota da API permite ≈6 uploads por dia no total.
          </p>
        )}
        {selectedAccount?.platform === "FACEBOOK" && (
          <p className="mt-1.5 text-[11px] text-muted">Os vídeos serão publicados como Reels nesta Página do Facebook.</p>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1 text-[11px] font-semibold uppercase text-muted">1. Horários disponíveis</p>
        <p className="mb-2 text-xs text-gray-400">Adicione os horários em que você aceita publicar. Você pode editar esta lista a qualquer momento.</p>
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
        <p className="mb-1 text-[11px] font-semibold uppercase text-muted">2. Quantos vídeos por dia?</p>
        <p className="mb-2 text-xs text-gray-400">A quantidade define quantos horários da lista acima serão usados, espaçados ao longo do dia.</p>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-[#171717] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setVideosPerDay((value) => Math.max(1, value - 1))}
              disabled={effectiveVideosPerDay <= 1}
              aria-label="Diminuir vídeos por dia"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus size={14} />
            </button>
            <div className="min-w-24 text-center">
              <p className="text-lg font-semibold leading-5 text-foreground">{effectiveVideosPerDay}</p>
              <p className="mt-1 text-[11px] text-muted">{effectiveVideosPerDay === 1 ? "vídeo por dia" : "vídeos por dia"}</p>
            </div>
            <button
              type="button"
              onClick={() => setVideosPerDay((value) => Math.min(maxVideosPerDay, value + 1))}
              disabled={effectiveVideosPerDay >= maxVideosPerDay}
              aria-label="Aumentar vídeos por dia"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Horários usados neste lote</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 sm:justify-end">
              {slots.map((slot) => (
                <span key={slot} className="rounded-md bg-accent/15 px-2 py-1 text-xs font-medium text-accent">{slot}</span>
              ))}
            </div>
          </div>
        </div>
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

      <CoverImagePicker file={coverFile} onChange={setCoverFile} />

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-gray-300">
        <HardDrive size={14} className="shrink-0 text-muted" />
        <span className="flex-1">
          {!socialAccountId
            ? "Escolha uma conta ou Página para ver quantos vídeos estão disponíveis no Drive."
            : loadingFiles
              ? "Contando vídeos disponíveis…"
              : filesError
                ? <span className="text-red-300">{filesError}</span>
              : `${files?.length ?? 0} vídeo(s) disponível(is) na pasta desta conta/Página.`}
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
          {files?.length} vídeo(s) · 1 teste imediato · de {formatDateTime(preview.first)} até {formatDateTime(preview.last)}, em ~{preview.days} dia(s).
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
        {submitting && progressLabel ? progressLabel : `Testar e agendar ${files?.length ?? 0} vídeo(s)`}
      </button>
    </div>
  );
}
