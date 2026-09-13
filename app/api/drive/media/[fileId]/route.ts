import { Readable } from "node:stream";
import { streamDriveFile } from "@/lib/server/google-drive";

export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const file = await streamDriveFile(fileId, request.headers.get("range"));
    const headers = new Headers({
      "Content-Type": file.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=300",
    });
    const range = request.headers.get("range");
    const rangeMatch = range?.match(/^bytes=(\d+)-(\d*)$/);
    if (file.contentRange) {
      headers.set("Content-Range", file.contentRange);
    } else if (rangeMatch && file.size !== null) {
      const start = Number(rangeMatch[1]);
      const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : file.size - 1;
      const end = Math.min(requestedEnd, file.size - 1);
      headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
      headers.set("Content-Length", String(Math.max(0, end - start + 1)));
    } else if (file.size !== null) {
      headers.set("Content-Length", String(file.size));
    }
    return new Response(Readable.toWeb(file.stream) as unknown as ReadableStream, {
      status: file.status,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar mídia do Google Drive.";
    const needsReconnect = /invalid_grant|invalid authentication credentials|unauthorized/i.test(message);
    return Response.json(
      {
        error: needsReconnect
          ? "A conexão do Google Drive expirou. Reconecte o Drive em Configurações para carregar esta mídia."
          : message,
        code: needsReconnect ? "DRIVE_REAUTH_REQUIRED" : "DRIVE_MEDIA_ERROR",
      },
      { status: needsReconnect ? 401 : 502 }
    );
  }
}
