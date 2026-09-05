import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo } from "@/lib/server/meta/db";

/** Cancela 1 destino de um post agendado (não o post inteiro — outro destino do mesmo vídeo
 *  pode continuar agendado normalmente). Só faz sentido pra destinos que ainda não rodaram:
 *  um já publicado não tem como "descancelar" e um em processamento pode estar publicando
 *  agora mesmo, então nem um nem outro aceita cancelamento aqui. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = await scheduledPostAccountsRepo.get(id);
  if (!destination) {
    return NextResponse.json({ error: "Destino não encontrado." }, { status: 404 });
  }
  if (destination.status === "published" || destination.status === "processing") {
    return NextResponse.json(
      { error: "Não é possível cancelar um destino já publicado ou em processamento." },
      { status: 409 }
    );
  }

  await scheduledPostAccountsRepo.updateResult(id, { status: "cancelled" });
  await scheduledPostsRepo.syncStatusFromAccounts(destination.scheduledPostId);

  return NextResponse.json({ ok: true });
}
