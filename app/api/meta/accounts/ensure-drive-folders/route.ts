import { NextResponse } from "next/server";
import { ensureScheduledVideosFolder, isDriveConfigured, isDriveConnected } from "@/lib/server/google-drive";
import { socialAccountsRepo } from "@/lib/server/meta/db";

/** Garante as pastas de agendamento de todas as contas Instagram já cadastradas.
 *  É idempotente: contas que já possuem a pasta não geram duplicatas. */
export async function POST() {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive não configurado — veja .env.local.example." }, { status: 400 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  const accounts = (await socialAccountsRepo.list()).filter(
    (account) => account.platform === "INSTAGRAM" && Boolean(account.username)
  );
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        await ensureScheduledVideosFolder(account.username!);
        return { id: account.id, username: account.username, ok: true as const };
      } catch (error) {
        return {
          id: account.id,
          username: account.username,
          ok: false as const,
          error: error instanceof Error ? error.message : "Falha ao garantir a pasta.",
        };
      }
    })
  );
  const failed = results.filter((result) => !result.ok);

  return NextResponse.json(
    { ensured: results.filter((result) => result.ok), failed },
    { status: failed.length > 0 ? 502 : 200 }
  );
}
