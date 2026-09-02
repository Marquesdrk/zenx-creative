"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, HardDrive, Loader2, Sparkles } from "lucide-react";
import { MAX_VIDEOS_PER_DAY, pickTimeSlots, planSchedule } from "@/lib/scheduling/plan";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

type DriveFile = { id: string; name: string; createdTime: string | null };

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Agendamento automático em massa: em vez de escolher vídeo por vídeo, o usuário escolhe uma
 *  conta e quantos vídeos por dia — o sistema conta quantos vídeos ainda não usados existem na
 *  pasta de agendados dessa conta no Drive (a mesma que "Enviar ao Drive" no Editor em massa
 *  alimenta) e distribui todos nos melhores horários entre 8h e 22h, um post por vídeo. */
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
  const [videosPerDay, setVideosPerDay] = useState(1);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!socialAccountId) {
      setFiles(null);
      return;
    }
    setLoadingFiles(true);
    setFilesError(null);
    setFiles(null);
    fetch(`/api/drive/folder-files?socialAccountId=${socialAccountId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}) as { error?: string; files?: DriveFile[] });
        if (!res.ok) throw new Error(data.error || "Falha ao listar vídeos do Drive.");
        setFiles((data.files as DriveFile[]) ?? []);
      })
      .catch((err) => setFilesError(err instanceof Error ? err.message : "Falha ao listar vídeos do Drive."))
      .finally(() => setLoadingFiles(false));
  }, [socialAccountId]);

  const preview = useMemo(() => {
    if (!files || files.length === 0) return null;
    const schedule = planSchedule(files.length, videosPerDay);
    return {
      first: schedule[0],
      last: schedule[schedule.length - 1],
      days: Math.ceil(files.length / Math.min(videosPerDay, MAX_VIDEOS_PER_DAY)),
    };
  }, [files, videosPerDay]);

  async function handleSchedule() {
    if (!files || files.length === 0 || !socialAccountId) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessMessage(null);
    const schedule = planSchedule(files.length, videosPerDay);

    try {
      for (let i = 0; i < files.length; i += 1) {
        setProgressLabel(`Agendando ${i + 1}/${files.length}`);
        const res = await fetch("/api/scheduled-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoSource: "drive",
            driveFileId: files[i].id,
            driveFileName: files[i].name,
            caption,
            scheduledAt: schedule[i].toISOString(),
            socialAccountIds: [socialAccountId],
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(data.error || `Falha ao agendar "${files[i].name}".`);
        }
      }
      setSuccessMessage(`${files.length} vídeo(s) agendado(s) com sucesso.`);
      setFiles([]);
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Falha ao agendar os vídeos.");
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  const slots = pickTimeSlots(videosPerDay);

  return (
    <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles size={15} className="text-accent" />
        Agendamento automático em massa
      </p>
      <p className="mt-1 text-xs text-muted">
        Escolha a conta e quantos vídeos por dia — o sistema conta os vídeos disponíveis na pasta
        de agendados dessa conta no Drive e distribui todos nos melhores horários entre 8h e 22h.
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
        <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase text-muted">
          Vídeos por dia
          <span className="normal-case text-gray-400">horários: {slots.join(", ")}</span>
        </p>
        <input
          type="range"
          min={1}
          max={MAX_VIDEOS_PER_DAY}
          value={videosPerDay}
          onChange={(event) => setVideosPerDay(Number(event.target.value))}
          className="w-full accent-accent"
        />
        <p className="mt-1 text-xs text-gray-300">{videosPerDay} vídeo(s) por dia</p>
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
        {!socialAccountId
          ? "Escolha uma conta para ver quantos vídeos estão disponíveis no Drive."
          : loadingFiles
            ? "Contando vídeos disponíveis…"
            : filesError
              ? <span className="text-red-300">{filesError}</span>
              : `${files?.length ?? 0} vídeo(s) disponível(is) na pasta desta conta.`}
      </div>

      {preview && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-gray-300">
          <CalendarRange size={14} className="shrink-0 text-muted" />
          De {formatDateTime(preview.first)} até {formatDateTime(preview.last)}, em ~{preview.days} dia(s).
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
