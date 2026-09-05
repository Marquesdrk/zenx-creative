"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, HardDrive, Send, Upload, X } from "lucide-react";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

const IS_VERCEL = Boolean(process.env.NEXT_PUBLIC_IS_VERCEL);

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Formulário de "Novo conteúdo": upload de vídeo, legenda, seleção de contas conectadas e
 *  publicar agora ou agendar — só mostra contas com status "connected" (uma expirada/revogada
 *  precisa ser reconectada em Contas Meta antes de aparecer aqui como destino disponível).
 *
 *  O upload de fato (Drive ou local/Blob) só acontece no submit — antes disso o vídeo escolhido
 *  fica só em memória (videoFile), porque o destino no Drive é organizado pela conta selecionada
 *  ("Zenx Creative - Agendados/@conta") e a conta só é escolhida depois do arquivo. */
export function ScheduledPostComposer({
  accounts,
  onCreated,
}: {
  accounts: PublicSocialAccount[];
  onCreated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [useDrive, setUseDrive] = useState(true);
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [submitting, setSubmitting] = useState<"schedule" | "now" | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/drive/status")
      .then((res) => res.json())
      .then((data: { configured: boolean; connected: boolean }) => {
        setDriveStatus(data);
        setUseDrive(data.configured && data.connected);
      })
      .catch(() => setDriveStatus({ configured: false, connected: false }));
  }, []);

  const connectedAccounts = useMemo(() => accounts.filter((a) => a.status === "connected"), [accounts]);
  const instagramAccounts = connectedAccounts.filter((a) => a.platform === "INSTAGRAM");
  const facebookAccounts = connectedAccounts.filter((a) => a.platform === "FACEBOOK");
  const driveAvailable = Boolean(driveStatus?.configured && driveStatus?.connected);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    // Aditivo: selecionar de novo soma aos já escolhidos, em vez de substituir — permite
    // juntar vídeos de pastas diferentes num único envio em massa.
    setVideoFiles((current) => [...current, ...files]);
    event.target.value = "";
  }

  function removeVideoFile(index: number) {
    setVideoFiles((current) => current.filter((_, i) => i !== index));
  }

  /** Sobe e agenda/publica um único vídeo — mesma lógica de sempre, extraída pra rodar em
   *  loop quando o usuário seleciona vários de uma vez. */
  async function submitOneFile(file: File, mode: "schedule" | "now", selectedIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
    let payload: Record<string, unknown>;

    if (useDrive && driveAvailable) {
      let uploadRes: Response;
      let blobUrl: string | null = null;

      if (IS_VERCEL) {
        // Sobe pro Blob primeiro (direto do navegador) e manda só a URL — a function de
        // /upload-to-drive rejeitaria com 413 qualquer vídeo real enviado direto no corpo da
        // requisição (limite fixo de ~4.5MB da Vercel, não contornável com maxDuration/memória).
        try {
          const blob = await upload(`scheduled-posts/${crypto.randomUUID()}-${file.name}`, file, {
            access: "private",
            handleUploadUrl: "/api/blob/upload",
            multipart: true,
            contentType: file.type || "video/mp4",
          });
          blobUrl = blob.url;
        } catch {
          return { ok: false, error: "Falha ao enviar o vídeo." };
        }
        uploadRes = await fetch("/api/scheduled-posts/upload-to-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blobUrl, filename: file.name, socialAccountId: selectedIds[0] }),
        });
      } else {
        // Localmente não existe o limite de ~4.5MB de payload das functions da Vercel, então o
        // arquivo vai direto no corpo da requisição, sem Blob.
        const formData = new FormData();
        formData.set("file", file, file.name);
        formData.set("filename", file.name);
        formData.set("socialAccountId", selectedIds[0]);
        uploadRes = await fetch("/api/scheduled-posts/upload-to-drive", { method: "POST", body: formData });
      }

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        return { ok: false, error: data.error || "Falha ao enviar o vídeo para o Google Drive." };
      }
      const data = (await uploadRes.json()) as { driveFileId: string; driveFileName: string };
      payload = { videoSource: "drive", driveFileId: data.driveFileId, driveFileName: data.driveFileName };
      if (blobUrl) {
        // O vídeo já está a salvo no Drive — o blob temporário só existiu pra contornar o
        // limite de corpo de requisição, não precisa sobreviver além deste submit.
        fetch("/api/blob/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [blobUrl] }),
        }).catch(() => {});
      }
    } else {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        return { ok: false, error: "Falha ao enviar o vídeo." };
      }
      const data = (await uploadRes.json()) as { url: string };
      payload = { videoSource: "url", videoUrl: data.url };
    }

    const res = await fetch("/api/scheduled-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        caption,
        scheduledAt: mode === "now" ? null : new Date(scheduledAt).toISOString(),
        socialAccountIds: selectedIds,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || "Falha ao criar a publicação." };
    }
    return { ok: true };
  }

  async function submit(mode: "schedule" | "now") {
    if (videoFiles.length === 0) {
      setError("Envie ao menos um vídeo antes de publicar.");
      return;
    }
    if (selected.size === 0) {
      setError("Selecione ao menos uma conta de destino.");
      return;
    }
    setSubmitting(mode);
    setError(null);

    const selectedIds = Array.from(selected);
    const failures: string[] = [];
    for (let i = 0; i < videoFiles.length; i += 1) {
      setProgressLabel(videoFiles.length > 1 ? `Enviando ${i + 1}/${videoFiles.length}` : null);
      const result = await submitOneFile(videoFiles[i], mode, selectedIds);
      if (!result.ok) failures.push(`${videoFiles[i].name}: ${result.error}`);
    }

    setSubmitting(null);
    setProgressLabel(null);
    if (failures.length > 0) {
      setError(
        failures.length === videoFiles.length
          ? failures.join(" | ")
          : `${videoFiles.length - failures.length}/${videoFiles.length} enviados. Falhas — ${failures.join(" | ")}`
      );
    }
    setVideoFiles([]);
    setCaption("");
    setSelected(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    onCreated();
  }

  return (
    <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
      <p className="text-sm font-semibold text-foreground">Novo conteúdo</p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Vídeo(s)</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
          id="composer-video-input"
        />
        <label
          htmlFor="composer-video-input"
          className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted hover:bg-card-hover"
        >
          <Upload size={16} />
          {videoFiles.length > 0 ? "Adicionar mais vídeos" : "Clique para enviar um ou vários vídeos"}
        </label>

        {videoFiles.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {videoFiles.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-gray-200"
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remover ${file.name}`}
                  onClick={() => removeVideoFile(index)}
                  className="shrink-0 text-muted hover:text-red-300"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {driveStatus?.configured && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-[11px] text-gray-300">
            <input
              type="checkbox"
              checked={useDrive}
              disabled={!driveAvailable}
              onChange={(event) => setUseDrive(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <HardDrive size={13} className="shrink-0" />
            {driveAvailable
              ? "Guardar no Google Drive (organizado por conta) em vez de upload local"
              : "Google Drive não conectado — conecte em Configurações para guardar os vídeos lá"}
          </label>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Legenda</p>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={3}
          placeholder="Escreva a legenda deste Reel…"
          className="w-full resize-none rounded-lg border border-border bg-background p-2.5 text-sm text-foreground"
        />
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Publicar em</p>
        {connectedAccounts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            Nenhuma conta conectada ainda — vá em &quot;Contas Meta&quot; e clique em Conectar Meta.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {instagramAccounts.length > 0 && (
              <AccountGroup label="Instagram" accounts={instagramAccounts} selected={selected} onToggle={toggle} />
            )}
            {facebookAccounts.length > 0 && (
              <AccountGroup label="Facebook" accounts={facebookAccounts} selected={selected} onToggle={toggle} />
            )}
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-[11px] font-semibold uppercase text-muted">
          Data e hora (para agendar)
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-[#171717] px-2 py-1.5 text-xs normal-case text-foreground"
          />
        </label>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => submit("schedule")}
          disabled={submitting !== null}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-[#171717] text-xs font-semibold text-gray-200 hover:bg-card-hover disabled:opacity-50"
        >
          <CalendarClock size={13} />
          {submitting === "schedule" && progressLabel ? progressLabel : "Agendar publicação"}
        </button>
        <button
          type="button"
          onClick={() => submit("now")}
          disabled={submitting !== null}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-semibold text-background disabled:opacity-50"
        >
          <Send size={13} />
          {submitting === "now" && progressLabel ? progressLabel : "Publicar agora"}
        </button>
      </div>
    </div>
  );
}

function AccountGroup({
  label,
  accounts,
  selected,
  onToggle,
}: {
  label: string;
  accounts: PublicSocialAccount[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-col gap-1.5">
        {accounts.map((account) => (
          <label
            key={account.id}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs text-gray-200 hover:bg-card-hover"
          >
            <input
              type="checkbox"
              checked={selected.has(account.id)}
              onChange={() => onToggle(account.id)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span className="truncate">
              {account.accountName}
              {account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
