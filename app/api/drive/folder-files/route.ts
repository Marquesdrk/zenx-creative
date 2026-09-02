import { NextResponse } from "next/server";
import { isDriveConfigured, isDriveConnected, listFilesInFolder, scheduledVideosFolderSegments } from "@/lib/server/google-drive";
import { scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/meta/db";

/** Lista os vídeos "disponíveis" (ainda não agendados) na pasta de agendados de uma conta —
 *  base do agendamento automático em massa: o usuário escolhe quantos vídeos por dia e o
 *  sistema distribui só o que ainda não foi usado, sem duplicar publicação do mesmo arquivo. */
export async function GET(request: Request) {
  try {
    if (!isDriveConfigured()) {
      return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
    }
    if (!(await isDriveConnected())) {
      return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
    }

    const socialAccountId = new URL(request.url).searchParams.get("socialAccountId");
    if (!socialAccountId) {
      return NextResponse.json({ error: "Informe socialAccountId." }, { status: 400 });
    }
    const account = await socialAccountsRepo.get(socialAccountId);
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    }
    const folderName = account.username || account.accountName;

    const files = await listFilesInFolder(scheduledVideosFolderSegments(folderName));
    const posts = await scheduledPostsRepo.list();
    const usedDriveFileIds = new Set(posts.filter((p) => p.status !== "cancelled" && p.status !== "failed").map((p) => p.driveFileId));
    const availableFiles = files.filter((file) => !usedDriveFileIds.has(file.id));
    return NextResponse.json({
      totalInFolder: files.length,
      files: availableFiles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao listar vídeos do Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
