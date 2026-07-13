import { VideoCard } from "./video-card";
import type { Batch, EditorVideo, Profile } from "@/lib/editor/types";

export function VideoGrid({
  videos,
  batches,
  profiles,
  onEdit,
}: {
  videos: EditorVideo[];
  batches: Batch[];
  profiles: Profile[];
  onEdit: (video: EditorVideo) => void;
}) {
  if (videos.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        Nenhum vídeo importado ainda. Clique em &quot;+ Novo lote&quot; para começar.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      {videos.map((video) => {
        const batch = batches.find((b) => b.id === video.batchId);
        const profile = profiles.find((p) => p.id === batch?.profileId);
        if (!batch || !profile) return null;
        return (
          <VideoCard key={video.id} video={video} profile={profile} onEdit={() => onEdit(video)} />
        );
      })}
    </div>
  );
}
