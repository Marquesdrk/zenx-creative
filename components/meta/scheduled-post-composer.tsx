"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, HardDrive, Send, Upload } from "lucide-react";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  const [useDrive, setUseDrive] = useState(true);
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [submitting, setSubmitting] = useState<"schedule" | "now" | null>(null);
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
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setVideoFile(file);
  }

  async function submit(mode: "schedule" | "now") {
    if (!videoFile) {
      setError("Envie um vídeo antes de publicar.");
      return;
    }
    if (selected.size === 0) {
      setError("Selecione ao menos uma conta de destino.");
      return;
    }
    setSubmitting(mode);
    setError(null);

    const selectedIds = Array.from(selected);
    let payload: Record<string, unknown>;

    if (useDrive && driveAvailable) {
      // Sobe pro Blob primeiro (direto do navegador) e manda só a URL — a function de
      // /upload-to-drive rejeitaria com 413 qualquer vídeo real enviado direto no corpo da
      // requisição (limite fixo de ~4.5MB da Vercel, não contornável com maxDuration/memória).
      let blob: { url: string };
      try {
        blob = await upload(`scheduled-posts/${crypto.randomUUID()}-${videoFile.name}`, videoFile, {
          access: "private",
          handleUploadUrl: "/api/blob/upload",
          multipart: true,
          contentType: videoFile.type || "video/mp4",
        });
      } catch {
        setSubmitting(null);
        setError("Falha ao enviar o vídeo.");
        return;
      }
      const uploadRes = await fetch("/api/scheduled-posts/upload-to-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, filename: videoFile.name, socialAccountId: selectedIds[0] }),
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        setSubmitting(null);
        setError(data.error || "Falha ao enviar o vídeo para o Google Drive.");
        return;
      }
      const data = (await uploadRes.json()) as { driveFileId: string; driveFileName: string };
      payload = { videoSource: "drive", driveFileId: data.driveFileId, driveFileName: data.driveFileName };
      // O vídeo já está a salvo no Drive — o blob temporário só existiu pra contornar o
      // limite de corpo de requisição, não precisa sobreviver além deste submit.
      fetch("/api/blob/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [blob.url] }),
      }).catch(() => {});
    } else {
      const formData = new FormData();
      formData.append("file", videoFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        setSubmitting(null);
        setError("Falha ao enviar o vídeo.");
        return;
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
    setSubmitting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Falha ao criar a publicação.");
      return;
    }
    setVideoFile(null);
    setCaption("");
    setSelected(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    onCreated();
  }

  return (
    <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
      <p className="text-sm font-semibold text-foreground">Novo conteúdo</p>

      <div className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">Vídeo</p>
        <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" id="composer-video-input" />
        <label
          htmlFor="composer-video-input"
          className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs text-muted hover:bg-card-hover"
        >
          <Upload size={16} />
          {videoFile ? videoFile.name : "Clique para enviar um vídeo"}
        </label>

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
          Agendar publicação
        </button>
        <button
          type="button"
          onClick={() => submit("now")}
          disabled={submitting !== null}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-semibold text-background disabled:opacity-50"
        >
          <Send size={13} />
          Publicar agora
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
