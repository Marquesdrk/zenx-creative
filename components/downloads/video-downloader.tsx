"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Camera, Check, Download, Link2, Loader2, Music2, Search, Square } from "lucide-react";

type Video = {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  viewCount: number | null;
  duration: number | null;
  uploadDate: string | null;
  platform: "INSTAGRAM" | "TIKTOK";
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "Duração indisponível";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatDate(value: string | null) {
  if (!value || value.length !== 8) return "Data indisponível";
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
}

function formatViews(value: number | null) {
  if (value === null) return "Views indisponíveis";
  return `${new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)} views`;
}

export function VideoDownloader() {
  const [profileUrl, setProfileUrl] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<"INSTAGRAM" | "TIKTOK" | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedVideos = useMemo(() => videos.filter((video) => selected.has(video.id)), [selected, videos]);
  const allSelected = videos.length > 0 && selected.size === videos.length;

  async function inspect() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setVideos([]);
    setSelected(new Set());
    try {
      const response = await fetch("/api/video-downloads/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: profileUrl, limit: 100 }),
      });
      const body = (await response.json()) as { error?: string; videos?: Video[]; platform?: "INSTAGRAM" | "TIKTOK" };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível consultar o perfil.");
      const found = body.videos ?? [];
      setVideos(found);
      setPlatform(body.platform ?? null);
      setSelected(new Set(found.map((video) => video.id)));
      if (found.length === 0) setNotice("Nenhum vídeo foi encontrado nesse perfil.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível consultar o perfil.");
    } finally {
      setLoading(false);
    }
  }

  function toggleVideo(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(videos.map((video) => video.id)));
  }

  async function downloadSelected() {
    if (!selectedVideos.length) return;
    setDownloading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/video-downloads/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: profileUrl, urls: selectedVideos.map((video) => video.url) }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Não foi possível baixar os vídeos.");
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `zenx-${platform === "TIKTOK" ? "tiktok" : "instagram"}-videos.zip`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      setNotice(`${selectedVideos.length} vídeo(s) preparado(s) para download.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível baixar os vídeos.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-accent">Biblioteca de origem</p>
          <h1 className="text-3xl font-semibold text-foreground">Baixar vídeos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Cole o perfil do Instagram ou TikTok, escolha os vídeos e baixe tudo em um único arquivo ZIP.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white/[0.03] px-4 py-3 text-xs text-muted">
          <span className="font-semibold text-foreground">Até 100 vídeos por consulta</span><br />
          A seleção começa marcada, mas você pode ajustar antes de baixar.
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/15 text-accent"><Link2 size={19} /></div>
          <div>
            <h2 className="font-semibold text-foreground">Fonte dos vídeos</h2>
            <p className="text-xs text-muted">Use uma URL pública de perfil, como instagram.com/perfil ou tiktok.com/@perfil.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">URL do perfil</span>
            <Link2 size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={profileUrl}
              onChange={(event) => setProfileUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void inspect(); }}
              placeholder="https://www.instagram.com/perfil ou https://www.tiktok.com/@perfil"
              className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-4 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <button type="button" onClick={() => void inspect()} disabled={loading || !profileUrl.trim()} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
            {loading ? "Consultando..." : "Buscar vídeos"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">O perfil precisa estar público ou acessível pelo seu login/cookies do yt-dlp. No Instagram, a plataforma pode exigir cookies mesmo para perfis públicos.</p>
      </section>

      {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle size={18} className="mt-0.5 shrink-0" />{error}</div>}
      {notice && <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}

      {videos.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-xl ${platform === "TIKTOK" ? "bg-cyan-400/15 text-cyan-300" : "bg-pink-400/15 text-pink-300"}`}>
                {platform === "TIKTOK" ? <Music2 size={19} /> : <Camera size={19} />}
              </div>
              <div><h2 className="font-semibold text-foreground">Vídeos encontrados</h2><p className="text-xs text-muted">{videos.length} resultado(s) · {selected.size} selecionado(s)</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleAll} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-white/[0.05]">
                {allSelected ? <Square size={15} /> : <Check size={15} />}{allSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <button type="button" onClick={() => void downloadSelected()} disabled={downloading || selected.size === 0} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{downloading ? "Baixando..." : "Baixar selecionados"}
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {videos.map((video) => {
              const isSelected = selected.has(video.id);
              return (
                <button key={`${video.platform}-${video.id}`} type="button" onClick={() => toggleVideo(video.id)} className={`group flex min-h-[132px] items-stretch gap-3 overflow-hidden rounded-xl border p-2 text-left transition ${isSelected ? "border-accent bg-accent/10" : "border-border bg-background hover:border-accent/50"}`}>
                  <span
                    role="img"
                    aria-label={`Capa do vídeo: ${video.title}`}
                    className="relative w-[82px] shrink-0 overflow-hidden rounded-lg bg-white/[0.06] bg-cover bg-center"
                    style={video.thumbnail ? { backgroundImage: `url(${JSON.stringify(video.thumbnail)})` } : undefined}
                  >
                    {!video.thumbnail && <span className="absolute inset-0 grid place-items-center text-muted"><Download size={18} /></span>}
                    <span className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-md shadow-lg ${isSelected ? "bg-accent text-white" : "bg-black/65 text-white"}`}>{isSelected ? <Check size={16} /> : <Square size={15} />}</span>
                    {video.duration && <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">{formatDuration(video.duration)}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center py-1"><span className="line-clamp-2 text-sm font-semibold text-foreground">{video.title}</span><span className="mt-2 text-xs text-muted">{formatViews(video.viewCount)}</span><span className="mt-1 text-xs text-muted">{formatDate(video.uploadDate)}</span></span>
                </button>
              );
            })}
          </div>
          {platform === "TIKTOK" && <p className="mt-5 text-xs leading-5 text-muted">TikTok: o download usa a melhor mídia direta disponibilizada pelo extractor e tenta evitar a marca d’água. A plataforma pode limitar esse resultado em alguns vídeos.</p>}
        </section>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {["Cole a URL do perfil", "Selecione os vídeos", "Baixe um ZIP"].map((title, index) => <div key={title} className="rounded-xl border border-border bg-card/60 p-4"><span className="text-xs font-bold text-accent">0{index + 1}</span><h3 className="mt-2 text-sm font-semibold text-foreground">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{index === 0 ? "O sistema consulta os vídeos disponíveis no perfil." : index === 1 ? "Marque ou desmarque qualquer item da lista." : "Os arquivos selecionados são organizados em um único download."}</p></div>)}
      </div>
    </div>
  );
}
