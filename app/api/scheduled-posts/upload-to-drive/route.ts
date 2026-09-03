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
 *  Recebe um `blobUrl` (não o arquivo em si) — funções da Vercel rejeitam com 413 qualquer
 *  corpo de requisição acima de ~4.5MB, um limite fixo da plataforma que nenhum `maxDuration`
 *  ou config de memória contorna. O vídeo precisa chegar aqui já hospedado no Vercel Blob
 *  (upload direto do navegador, sem passar pela function) — esta rota só baixa esse blob e
 *  repassa pro Drive, server-to-server, fora do limite de corpo de requisição. */
export async function POST(request: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as
    | { blobUrl?: string; filename?: string; socialAccountId?: string }
    | null;
  if (!body?.blobUrl || !body.socialAccountId) {
    return NextResponse.json({ error: "Envie a URL do vídeo temporário e a conta de destino." }, { status: 400 });
  }

  const account = await socialAccountsRepo.get(body.socialAccountId);
  if (!account) {
    return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
  }
  const folderName = account.username || account.accountName;

  try {
    const blob = await get(body.blobUrl, { access: "private", useCache: false });
    if (!blob?.stream || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Não foi possível baixar o vídeo temporário para enviar ao Drive." }, { status: 502 });
    }
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    const result = await uploadScheduledVideoToDrive(
      buffer,
      body.filename || `video-${Date.now()}.mp4`,
      "video/mp4",
      folderName
    );
    return NextResponse.json({ driveFileId: result.fileId, driveFileName: result.fileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enviar o vídeo para o Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
