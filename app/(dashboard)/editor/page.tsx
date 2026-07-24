"use client";

import { useEffect, useRef, useState } from "react";
import { BatchModal, type BatchSourceFile } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { VideoGrid } from "@/components/editor/video-grid";
import { useProfiles } from "@/lib/editor/profiles-store";
import { scheduleVideoProcessing } from "@/lib/editor/mock-processing";
import { GLOBAL_WATERMARK_DEFAULTS, resolveWatermarkDefaults } from "@/lib/editor/settings";
import type { Batch, EditorVideo, Profile } from "@/lib/editor/types";

function generateCaption(filename: string, profile: Profile) {
  if (profile.template === "shop-content") return "Link na bio";
  if (profile.template === "twitter-style") {
    return `${profile.editorialTone} — legenda original de ${filename}, transcrita e reescrita mantendo o mesmo assunto.`;
  }
  return `Legenda gerada automaticamente a partir de ${filename}`;
}

export default function EditorPage() {
  const [profiles] = useProfiles();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [videos, setVideos] = useState<EditorVideo[]>([]);
  const [sentToDriveCount, setSentToDriveCount] = useState(0);
  const [isBatchModalOpen, setBatchModalOpen] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const cleanupsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  function handleBatchSubmit(params: { profileId: string; files: BatchSourceFile[] }) {
    // Videos already marked "Pronto" from a previous batch are considered handed off
    // to the (future) Google Drive output folder, so they leave the active grid here.
    const readyFromPreviousBatches = videos.filter((v) => v.status === "ready");
    if (readyFromPreviousBatches.length > 0) {
      setSentToDriveCount((count) => count + readyFromPreviousBatches.length);
      readyFromPreviousBatches.forEach((v) => {
        if (v.contentUrl) URL.revokeObjectURL(v.contentUrl);
      });
    }

    const profile = profiles.find((p) => p.id === params.profileId);
    if (!profile) return;

    const batch: Batch = {
      id: crypto.randomUUID(),
      profileId: params.profileId,
      template: profile.template,
      createdAt: new Date().toISOString(),
    };

    // Nível 2 (padrão do perfil) substitui o nível 1 (padrão global) quando definido.
    // Só é relevante para perfis Shop/Content; os demais templates não têm marca d'água.
    const watermarkDefaults =
      profile.template === "shop-content"
        ? resolveWatermarkDefaults(profile)
        : GLOBAL_WATERMARK_DEFAULTS;

    const newVideos: EditorVideo[] = params.files.map(({ name: filename, url }, index) => ({
      id: crypto.randomUUID(),
      batchId: batch.id,
      filename,
      status: "importing",
      caption: generateCaption(filename, profile),
      watermarkPosition: { ...watermarkDefaults },
      cropBox: { x: 50, y: 50 },
      // Template React carrega automaticamente as mídias de reação salvas do perfil.
      reactionMediaId:
        profile.template === "react" && profile.reactionMedia.length > 0
          ? profile.reactionMedia[index % profile.reactionMedia.length].id
          : null,
      contentUrl: url,
    }));

    setBatches((current) => [...current, batch]);
    setVideos((current) => [...newVideos, ...current.filter((v) => v.status !== "ready")]);
    setBatchModalOpen(false);

    newVideos.forEach((video, index) => {
      const cleanup = scheduleVideoProcessing(index, (status) => {
        setVideos((current) => current.map((v) => (v.id === video.id ? { ...v, status } : v)));
      });
      cleanupsRef.current.push(cleanup);
    });
  }

  function handleSaveEdit(updated: EditorVideo, applyToAll: boolean) {
    setVideos((current) =>
      current.map((v) => {
        if (v.id === updated.id) return updated;
        if (applyToAll && v.batchId === updated.batchId) {
          return {
            ...v,
            caption: updated.caption,
            watermarkPosition: updated.watermarkPosition,
            cropBox: updated.cropBox,
            reactionMediaId: updated.reactionMediaId,
          };
        }
        return v;
      })
    );
    setEditingVideoId(null);
  }

  const editingVideo = videos.find((v) => v.id === editingVideoId) ?? null;
  const editingBatch = editingVideo ? batches.find((b) => b.id === editingVideo.batchId) : null;
  const editingProfile = editingBatch
    ? profiles.find((p) => p.id === editingBatch.profileId)
    : null;

  const readyCount = videos.filter((v) => v.status === "ready").length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Editor em massa</h1>
        <button
          type="button"
          onClick={() => setBatchModalOpen(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          + Novo lote
        </button>
      </div>
      <p className="text-sm text-muted">
        Importe e edite vídeos em massa: marca d&apos;água, legendas e templates automáticos.
      </p>
      <p className="mb-8 mt-1 text-xs text-muted">
        Vídeos prontos seguem para o Google Drive, pasta &quot;Vídeos para postar&quot; (a
        configurar) assim que você iniciar o próximo lote.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{readyCount}</div>
          <div className="text-xs text-muted">prontos neste lote</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{sentToDriveCount}</div>
          <div className="text-xs text-muted">enviados ao Drive</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-foreground">{batches.length}</div>
          <div className="text-xs text-muted">lotes criados</div>
        </div>
      </div>

      <VideoGrid
        videos={videos}
        batches={batches}
        profiles={profiles}
        onEdit={(video) => setEditingVideoId(video.id)}
      />

      {isBatchModalOpen && (
        <BatchModal
          profiles={profiles}
          onClose={() => setBatchModalOpen(false)}
          onSubmit={handleBatchSubmit}
        />
      )}

      {editingVideo && editingBatch && editingProfile && (
        <EditDrawer
          key={editingVideo.id}
          video={editingVideo}
          profile={editingProfile}
          onClose={() => setEditingVideoId(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
