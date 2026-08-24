import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/db";
import { processAllPendingAccountsForPost } from "@/lib/server/meta/publish";
import type { ScheduledPost, ScheduledPostAccount } from "@/lib/server/meta/types";

/** Mesmo formato de resposta usado por /api/batches (batches + items) — lista todos os posts
 *  agendados junto com todos os destinos (1 linha por conta), pra tela de Publicar montar a
 *  fila sem N+1 requests. */
export async function GET() {
  const posts = scheduledPostsRepo.list();
  const accounts = posts.flatMap((post) => scheduledPostAccountsRepo.listByPost(post.id));
  return NextResponse.json({ posts, accounts });
}

type CreateBody = {
  videoUrl: string;
  caption: string;
  scheduledAt: string | null;
  socialAccountIds: string[];
};

/** Cria 1 vídeo agendado com N destinos independentes (1 por conta selecionada). Se
 *  `scheduledAt` for nulo ou já tiver passado ("Publicar agora"), dispara o processamento sem
 *  bloquear a resposta HTTP — a Instagram/Facebook Reels API é assíncrona e pode levar minutos
 *  processando o vídeo (ver lib/server/meta/instagram.ts), então o cliente acompanha o status
 *  via GET nesta mesma rota em vez de esperar a resposta deste POST. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body?.videoUrl || !Array.isArray(body.socialAccountIds) || body.socialAccountIds.length === 0) {
    return NextResponse.json({ error: "Informe um vídeo e ao menos uma conta de destino." }, { status: 400 });
  }

  const accounts = body.socialAccountIds.map((id) => socialAccountsRepo.get(id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (accounts.length === 0) {
    return NextResponse.json({ error: "Nenhuma das contas selecionadas foi encontrada." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const scheduledAtIso = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;
  const isImmediate = !scheduledAtIso || scheduledAtIso <= now;

  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    userId: null,
    videoUrl: body.videoUrl,
    caption: body.caption ?? "",
    scheduledAt: scheduledAtIso,
    status: isImmediate ? "processing" : "scheduled",
    createdAt: now,
    updatedAt: now,
  };
  scheduledPostsRepo.create(post);

  for (const account of accounts) {
    const spa: ScheduledPostAccount = {
      id: crypto.randomUUID(),
      scheduledPostId: post.id,
      socialAccountId: account.id,
      status: "scheduled",
      externalPostId: null,
      errorCode: null,
      errorMessage: null,
      recoverable: null,
      attemptCount: 0,
      nextAttemptAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    scheduledPostAccountsRepo.create(spa);
  }

  if (isImmediate) {
    // Não aguardamos — o processo Node segue rodando isso em segundo plano após a resposta
    // (servidor self-hosted de longa duração, não uma função serverless que congela).
    void processAllPendingAccountsForPost(post.id);
  }

  const createdAccounts = scheduledPostAccountsRepo.listByPost(post.id);
  return NextResponse.json({ post, accounts: createdAccounts }, { status: 201 });
}
