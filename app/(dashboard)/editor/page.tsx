"use client";

import { useEffect, useRef, useState } from "react";
import { BatchModal } from "@/components/editor/batch-modal";
import { EditDrawer } from "@/components/editor/edit-drawer";
import { VideoGrid } from "@/components/editor/video-grid";
import { MOCK_PROFILES } from "@/lib/editor/mock-profiles";
import { scheduleVideoProcessing } from "@/lib/editor/mock-processing";
import type { Batch, EditorTemplate, EditorVideo } from "@/lib/editor/types";

function generateCaption(filename: string, template: EditorTemplate) {
  if (template === "shop-content") return "Link na bio";
  return `Legenda gerada automaticamente a partir de ${filename}`;
}

export default function EditorPage() {
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

  function handleBatchSubmit(params: {
    profileId: string;
    template: EditorTemplate;
    filenames: string[];
  }) {
    // Videos already marked "Pronto" from a previous batch are considered handed off
    // to the (future) Google Drive output folder, so they leave the active grid here.
    const readyFromPreviousBatches = videos.filter((v) => v.status === "ready").length;
    if (readyFromPreviousBatches > 0) {
      setSentToDriveCount((count) => count + readyFromPreviousBatches);
    }

    const batch: Batch = {
      id: crypto.randomUUID(),
      profileId: params.profileId,
      template: params.template,
      createdAt: new Date().toISOString(),
    };

    const newVideos: EditorVideo[] = params.filenames.map((filename) => ({
      id: crypto.randomUUID(),
      batchId: batch.id,
      filename,
      status: "importing",
      caption: generateCaption(filename, params.template),
      watermarkPosition: { x: 85, y: 90, scale: 1 },
      cropBox: { x: 50, y: 50 },
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

  function handleSaveEdit(updated: EditorVideo) {
    setVideos((current) => current.map((v) => (v.id === updated.id ? updated : v)));
    setEditingVideoId(null);
  }

  const editingVideo = videos.find((v) => v.id === editingVideoId) ?? null;
  const editingBatch = editingVideo ? batches.find((b) => b.id === editingVideo.batchId) : null;
  const editingProfile = editingBatch
    ? MOCK_PROFILES.find((p) => p.id === editingBatch.profileId)
    : null;

  const readyCount = videos.filter((v) => v.status === "ready").length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Editor em massa</h1>
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
          <div className="text-xl font-bold text-white">{readyCount}</div>
          <div className="text-xs text-muted">prontos neste lote</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-white">{sentToDriveCount}</div>
          <div className="text-xs text-muted">enviados ao Drive</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xl font-bold text-white">{batches.length}</div>
          <div className="text-xs text-muted">lotes criados</div>
        </div>
      </div>

      <VideoGrid
        videos={videos}
        batches={batches}
        profiles={MOCK_PROFILES}
        onEdit={(video) => setEditingVideoId(video.id)}
      />

      {isBatchModalOpen && (
        <BatchModal
          profiles={MOCK_PROFILES}
          onClose={() => setBatchModalOpen(false)}
          onSubmit={handleBatchSubmit}
        />
      )}

      {editingVideo && editingBatch && editingProfile && (
        <EditDrawer
          key={editingVideo.id}
          video={editingVideo}
          profile={editingProfile}
          template={editingBatch.template}
          onClose={() => setEditingVideoId(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}
