import { NextResponse } from "next/server";
import { socialAccountsRepo } from "@/lib/server/meta/db";
import { isDriveConfigured, isDriveConnected, uploadScheduledVideoToDrive } from "@/lib/server/google-drive";

// Vídeos grandes carregados inteiro em memória (arrayBuffer) antes do upload — mesmo padrão já
// usado em app/api/upload/route.ts para o caminho local/dev. Reels raramente passam de
// ~50-100MB, dentro do limite de memória das funções da Vercel.
export const maxDuration = 120;

/** Sobe um vídeo direto para "Zenx Creative - Agendados/@conta" no Google Drive do usuário —
 *  organizado pela conta de destino selecionada na tela de agendamento. O arquivo nunca é
 *  copiado para outro storage: scheduled_posts guarda só o drive_file_id (ver
 *  lib/server/meta/video-source.ts para como isso vira uma URL pública na hora de publicar). */
export async function POST(request: Request) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const socialAccountId = formData?.get("socialAccountId");
  if (!(file instanceof File) || typeof socialAccountId !== "string" || !socialAccountId) {
    return NextResponse.json({ error: "Envie um arquivo de vídeo e a conta de destino." }, { status: 400 });
  }

  const account = await socialAccountsRepo.get(socialAccountId);
  if (!account) {
    return NextResponse.json({ error: "Conta de destino não encontrada." }, { status: 404 });
  }
  const folderName = account.username || account.accountName;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadScheduledVideoToDrive(
      buffer,
      file.name || `video-${Date.now()}.mp4`,
      file.type || "video/mp4",
      folderName
    );
    return NextResponse.json({ driveFileId: result.fileId, driveFileName: result.fileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao enviar o vídeo para o Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
