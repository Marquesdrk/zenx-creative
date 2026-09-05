import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { socialAccountsRepo } from "@/lib/server/meta/db";
import { isDriveConfigured, isDriveConnected, uploadScheduledVideoToDrive } from "@/lib/server/google-drive";

export const maxDuration = 120;

/** Sobe um vídeo direto para "Zenx Creative - Agendados/@conta" no Google Drive do usuário —
 *  organizado pela conta de destino selecionada na tela de agendamento. O arquivo nunca é
 *  copiado para outro storage além do Blob temporário: scheduled_posts guarda só o
 *  drive_file_id (ver lib/server/meta/video-source.ts para como isso vira uma URL pública na
 *  hora de publicar).
 *
 *  Na Vercel, recebe um `blobUrl` (JSON) em vez do arquivo em si — funções da Vercel rejeitam
 *  com 413 qualquer corpo de requisição acima de ~4.5MB, um limite fixo da plataforma que
 *  nenhum `maxDuration` ou config de memória contorna, então o vídeo precisa chegar já
 *  hospedado no Vercel Blob (upload direto do navegador, sem passar pela function). Localmente
 *  esse limite não existe, então aceita também o arquivo direto via FormData multipart. */
export async function POST(request: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let blobUrl: string | undefined;
  let filename: string | undefined;
  let socialAccountId: string | undefined;
  let directFile: File | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { blobUrl?: string; filename?: string; socialAccountId?: string }
      | null;
    blobUrl = body?.blobUrl;
    filename = body?.filename;
    socialAccountId = body?.socialAccountId;
  } else {
    const formData = await request.formData();
    const file = formData.get("file");
    directFile = file instanceof File ? file : null;
    filename = (formData.get("filename") as string | null) ?? directFile?.name;
    socialAccountId = (formData.get("socialAccountId") as string | null) ?? undefined;
  }

  if ((!blobUrl && !directFile) || !socialAccountId) {
    return NextResponse.json({ error: "Envie o vídeo (ou a URL do temporário) e a conta de destino." }, { status: 400 });
  }

  const account = await socialAccountsRepo.get(socialAccountId);
  if (!account) {
    return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
  }
  const folderName = account.username || account.accountName;

  try {
    let buffer: Buffer;
    if (directFile) {
      buffer = Buffer.from(await directFile.arrayBuffer());
    } else {
      const blob = await get(blobUrl!, { access: "private", useCache: false });
      if (!blob?.stream || blob.statusCode !== 200) {
        return NextResponse.json({ error: "Não foi possível baixar o vídeo temporário para enviar ao Drive." }, { status: 502 });
      }
      buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    }
    const result = await uploadScheduledVideoToDrive(buffer, filename || `video-${Date.now()}.mp4`, "video/mp4", folderName);
    return NextResponse.json({ driveFileId: result.fileId, driveFileName: result.fileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enviar o vídeo para o Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
