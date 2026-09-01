import { Readable } from "node:stream";
import { streamDriveFile } from "@/lib/server/google-drive";
import { verifyDriveStreamToken } from "@/lib/server/google/drive-stream-url";

// Proxy de streaming: baixa o arquivo do Google Drive (com o token OAuth do servidor) e repassa
// os bytes via HTTPS público, sem nunca gravar uma segunda cópia do vídeo em disco/storage. É
// essa URL (gerada por buildSignedDriveStreamUrl, curta duração) que vira `video_url` na hora de
// publicar — a Meta baixa direto daqui, não do Drive (ver lib/server/meta/publish.ts).
//
// A publicação de um Reel pode envolver o servidor da Meta buscando este arquivo minutos depois
// da criação do container — funções serverless da Vercel precisam ficar vivas até isso terminar.
export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const url = new URL(request.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");

  if (!verifyDriveStreamToken(fileId, exp, sig)) {
    return new Response("Link expirado ou inválido.", { status: 403 });
  }

  try {
    const range = request.headers.get("range");
    const file = await streamDriveFile(fileId, range);
    const headers = new Headers({
      "Content-Type": file.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    });
    if (file.contentRange) headers.set("Content-Range", file.contentRange);
    if (file.size !== null && !file.contentRange) headers.set("Content-Length", String(file.size));

    return new Response(Readable.toWeb(file.stream) as unknown as ReadableStream, {
      status: file.status,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao baixar o arquivo do Google Drive.";
    return new Response(message, { status: 502 });
  }
}
