import { buildSignedDriveStreamUrl } from "@/lib/server/google/drive-stream-url";
import type { ScheduledPost } from "@/lib/server/meta/types";

// TTL da URL assinada do proxy do Drive — cobre o tempo entre "a Meta pede pra baixar o vídeo"
// e "a Meta efetivamente baixa" (criação do container + processamento pode levar minutos; ver
// waitForContainerReady em lib/server/meta/instagram.ts). Gerada de novo a cada tentativa de
// publicação (inclusive retries), nunca persistida.
const DRIVE_STREAM_TTL_SECONDS = 30 * 60;

/** Resolve a URL pública HTTPS que a Meta vai baixar para publicar este post — direta
 *  (videoSource "url") ou via proxy assinado do Drive (videoSource "drive"). Nunca duplica o
 *  arquivo: o proxy só repassa bytes na hora, lendo do Drive sob demanda. */
export function resolvePostVideoUrl(post: ScheduledPost): string {
  if (post.videoSource === "drive") {
    if (!post.driveFileId) throw new Error("Post marcado como Google Drive mas sem drive_file_id salvo.");
    return buildSignedDriveStreamUrl(post.driveFileId, DRIVE_STREAM_TTL_SECONDS);
  }
  if (!post.videoUrl) throw new Error("Post sem video_url e sem drive_file_id — nada para publicar.");
  return post.videoUrl;
}
