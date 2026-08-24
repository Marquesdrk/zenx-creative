"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarClock, Send, Upload } from "lucide-react";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

function toDatetimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Formulário de "Novo conteúdo": upload de vídeo, legenda, seleção de contas conectadas e
 *  publicar agora ou agendar — só mostra contas com status "connected" (uma expirada/revogada
 *  precisa ser reconectada em Contas Meta antes de aparecer aqui como destino disponível). */
export function ScheduledPostComposer({
  accounts,
  onCreated,
}: {
  accounts: PublicSocialAccount[];
  onCreated: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState(() => toDatetimeLocal(new Date(Date.now() + 60 * 60_000)));
  const [submitting, setSubmitting] = useState<"schedule" | "now" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedAccounts = useMemo(() => accounts.filter((a) => a.status === "connected"), [accounts]);
  const instagramAccounts = connectedAccounts.filter((a) => a.platform === "INSTAGRAM");
  const facebookAccounts = connectedAccounts.filter((a) => a.platform === "FACEBOOK");

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      setError("Falha ao enviar o vídeo.");
      return;
    }
    const data = (await res.json()) as { url: string; filename: string };
    setVideoUrl(data.url);
    setVideoName(data.filename);
  }

  async function submit(mode: "schedule" | "now") {
    if (!videoUrl) {
      setError("Envie um vídeo antes de publicar.");
      return;
    }
    if (selected.size === 0) {
      setError("Selecione ao menos uma conta de destino.");
      return;
    }
    setSubmitting(mode);
    setError(null);
    const res = await fetch("/api/scheduled-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl,
        caption,
        scheduledAt: mode === "now" ? null : new Date(scheduledAt).toISOString(),
        socialAccountIds: Array.from(selected),
      }),
    });
    setSubmitting(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Falha ao criar a publicação.");
      return;
    }
    setVideoUrl(null);
    setVideoName(null);
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
          {uploading ? "Enviando…" : videoName ? videoName : "Clique para enviar um vídeo"}
        </label>
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
