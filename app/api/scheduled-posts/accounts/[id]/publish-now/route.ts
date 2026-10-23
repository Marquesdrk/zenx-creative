import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo } from "@/lib/server/meta/db";
import { processScheduledPostAccount } from "@/lib/server/meta/publish";

/** Publica imediatamente um único destino já vencido, sem disparar os demais posts pendentes. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = await scheduledPostAccountsRepo.get(id);
  if (!destination) {
    return NextResponse.json({ error: "Destino não encontrado." }, { status: 404 });
  }

  const post = await scheduledPostsRepo.get(destination.scheduledPostId);
  if (!post) {
    return NextResponse.json({ error: "Publicação agendada não encontrada." }, { status: 404 });
  }
  if (!post.scheduledAt || new Date(post.scheduledAt).getTime() > Date.now()) {
    return NextResponse.json({ error: "Só é possível antecipar um post cujo horário já venceu." }, { status: 409 });
  }
  if (destination.status !== "scheduled") {
    return NextResponse.json({ error: `O destino está com status "${destination.status}".` }, { status: 409 });
  }

  await processScheduledPostAccount(destination.id);
  const updated = await scheduledPostAccountsRepo.get(destination.id);
  return NextResponse.json({ ok: updated?.status === "published", account: updated });
}
