import { NextResponse } from "next/server";
import { scheduledPostsRepo } from "@/lib/server/meta/db";

/** Muda o horário de um post ainda não processado — usado pelo "editar horário" na fila e
 *  pra reconfirmar que o agendador está rodando (reagenda pra daqui a poucos minutos e
 *  observa se publica sozinho no horário novo). Recusa mexer num post que já terminou
 *  (publicado/cancelado) — só faz sentido pra algo que ainda vai rodar. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { scheduledAt?: string } | null;
  if (!body?.scheduledAt) {
    return NextResponse.json({ error: "Informe o novo scheduledAt." }, { status: 400 });
  }

  const post = await scheduledPostsRepo.get(id);
  if (!post) {
    return NextResponse.json({ error: "Post não encontrado." }, { status: 404 });
  }
  if (post.status === "published" || post.status === "cancelled") {
    return NextResponse.json({ error: "Não é possível reagendar um post já publicado ou cancelado." }, { status: 409 });
  }

  const scheduledAtIso = new Date(body.scheduledAt).toISOString();
  await scheduledPostsRepo.updateScheduledAt(id, scheduledAtIso);

  return NextResponse.json({ ok: true, scheduledAt: scheduledAtIso });
}
