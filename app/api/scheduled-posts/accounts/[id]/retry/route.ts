import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo } from "@/lib/server/meta/db";

/** Volta um destino "failed" pra "scheduled", limpando o erro e zerando as tentativas — pra
 *  quando a causa do erro já foi corrigida (ex.: PUBLIC_BASE_URL configurada) e o vídeo merece
 *  uma nova chance sem precisar recriar o post do zero. O próximo run-due já pega ele de volta
 *  (não mexe em scheduled_at — publica assim que rodar, já que o horário original já passou). */
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

  return NextResponse.json({ ok: true });
}
