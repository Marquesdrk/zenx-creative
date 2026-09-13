import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo } from "@/lib/server/meta/db";
import { processScheduledPostAccount } from "@/lib/server/meta/publish";

/** Reabre um destino "failed" e tenta publicá-lo imediatamente — útil quando a causa do erro
 *  já foi corrigida (ex.: PUBLIC_BASE_URL configurada), sem recriar o post do zero. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = await scheduledPostAccountsRepo.get(id);
  if (!destination) {
    return NextResponse.json({ error: "Destino não encontrado." }, { status: 404 });
  }
  if (destination.status !== "failed") {
    return NextResponse.json({ error: "Só é possível tentar de novo um destino que falhou." }, { status: 409 });
  }

  await scheduledPostAccountsRepo.updateResult(id, {
    status: "scheduled",
    errorCode: null,
    errorMessage: null,
    recoverable: null,
    attemptCount: 0,
    nextAttemptAt: null,
  });
  await scheduledPostsRepo.syncStatusFromAccounts(destination.scheduledPostId);
  await processScheduledPostAccount(id);
  const updated = await scheduledPostAccountsRepo.get(id);

  return NextResponse.json({ ok: true, account: updated });
}
