import { NextResponse } from "next/server";
import { ensureScheduledVideosFolder, isDriveConfigured, isDriveConnected } from "@/lib/server/google-drive";
import { socialAccountsRepo } from "@/lib/server/meta/db";

/** Cria (se ainda não existir) a pasta "Zenx Creative - Agendados/@conta" no Drive dessa conta
 *  — usado pelo botão manual em Contas Meta, pra contas conectadas antes da criação automática
 *  no momento da conexão existir, ou caso o Drive só tenha sido conectado depois da conta. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  const account = await socialAccountsRepo.get(id);
  if (!account || account.platform !== "INSTAGRAM") {
    return NextResponse.json({ error: "Conta do Instagram não encontrada." }, { status: 404 });
  }
  if (!account.username) {
    return NextResponse.json({ error: "Conta sem @usuário salvo — reconecte a conta." }, { status: 400 });
  }

  try {
    await ensureScheduledVideosFolder(account.username);
    return NextResponse.json({ ok: true, folder: `Zenx Creative - Agendados/@${account.username.replace(/^@/, "")}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criar a pasta no Google Drive.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
