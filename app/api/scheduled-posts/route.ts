import { NextResponse } from "next/server";
import { scheduledPostAccountsRepo, scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { processAllPendingAccountsForPost } from "@/lib/server/meta/publish";
import type { ScheduledPost, ScheduledPostAccount } from "@/lib/server/meta/types";

/** Mesmo formato de resposta usado por /api/batches (batches + items) — lista todos os posts
 *  agendados junto com todos os destinos (1 linha por conta), pra tela de Publicar montar a
 *  fila sem N+1 requests. */
export async function GET() {
  try {
    const [posts, accounts] = await Promise.all([scheduledPostsRepo.list(), scheduledPostAccountsRepo.listAll()]);
    return NextResponse.json({ posts, accounts });
  } catch (error) {
    console.error("[scheduled-posts] list failed", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 503 });
  }
}

type CreateBody = {
  videoUrl?: string | null;
  videoSource?: "url" | "drive";
  driveFileId?: string | null;
  driveFileName?: string | null;
  caption: string;
  scheduledAt: string | null;
  socialAccountIds: string[];
};

/** Cria 1 vídeo agendado com N destinos independentes (1 por conta selecionada). Se
 *  `scheduledAt` for nulo ou já tiver passado ("Publicar agora"), processa esse primeiro destino
 *  antes de responder. Assim o vídeo de teste é tentado antes de o lote continuar; os vídeos
 *  futuros continuam sendo tratados pelo scheduler. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const videoSource: "url" | "drive" = body?.videoSource === "drive" ? "drive" : "url";
  const hasVideo = videoSource === "drive" ? Boolean(body?.driveFileId) : Boolean(body?.videoUrl);
  if (!body || !hasVideo || !Array.isArray(body.socialAccountIds) || body.socialAccountIds.length === 0) {
    return NextResponse.json({ error: "Informe um vídeo e ao menos uma conta de destino." }, { status: 400 });
  }

  let fetchedAccounts: Awaited<ReturnType<typeof socialAccountsRepo.get>>[];
  try {
    fetchedAccounts = await withDatabaseRetry(() =>
      Promise.all(body.socialAccountIds.map((id) => socialAccountsRepo.get(id)))
    );
  } catch (error) {
    const retryable = isTransientDatabaseError(error);
    console.error("[scheduled-posts] account lookup failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error), code: "SCHEDULE_ACCOUNT_LOOKUP_FAILED", retryable },
      { status: retryable ? 503 : 500 }
    );
  }
  const accounts = fetchedAccounts.filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (accounts.length === 0) {
    return NextResponse.json({ error: "Nenhuma das contas selecionadas foi encontrada." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const scheduledAtIso = body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null;
  const isImmediate = !scheduledAtIso || scheduledAtIso <= now;

  const post: ScheduledPost = {
    id: crypto.randomUUID(),
    userId: null,
    videoUrl: videoSource === "url" ? (body.videoUrl ?? null) : null,
    videoSource,
    driveFileId: videoSource === "drive" ? (body.driveFileId ?? null) : null,
    driveFileName: videoSource === "drive" ? (body.driveFileName ?? null) : null,
    caption: body.caption ?? "",
    scheduledAt: scheduledAtIso,
    status: isImmediate ? "processing" : "scheduled",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await withDatabaseRetry(() => scheduledPostsRepo.create(post));

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
      await withDatabaseRetry(() => scheduledPostAccountsRepo.create(spa));
    }

    const createdAccounts = await withDatabaseRetry(() => scheduledPostAccountsRepo.listByPost(post.id));
    if (isImmediate) {
      // O primeiro vídeo é o teste solicitado pelo usuário. Aguardar a tentativa torna o
      // resultado observável na tela e impede que o lote seja considerado concluído sem teste.
      await processAllPendingAccountsForPost(post.id).catch((error) => {
        console.error("[scheduled-posts] immediate publish failed", error);
      });
    }
    return NextResponse.json({ post, accounts: createdAccounts }, { status: 201 });
  } catch (error) {
    // O upload para o Drive acontece antes desta rota. Se o banco falhar, removemos o registro
    // parcial (a FK em scheduled_post_accounts também limpa os destinos) e devolvemos uma
    // mensagem estruturada para a tela poder exibir a causa real e repetir o envio.
    try {
      await withDatabaseRetry(() => scheduledPostsRepo.remove(post.id));
    } catch (cleanupError) {
      console.error("[scheduled-posts] cleanup failed", cleanupError);
    }
    const retryable = isTransientDatabaseError(error);
    console.error("[scheduled-posts] create failed", error);
    return NextResponse.json(
      { error: getErrorMessage(error), code: "SCHEDULE_CREATE_FAILED", retryable },
      { status: retryable ? 503 : 500 }
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha inesperada ao salvar o agendamento.";
}

function isTransientDatabaseError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return ["fetch failed", "econnreset", "econnrefused", "etimedout", "timeout", "503", "502", "504"].some((part) =>
    message.includes(part)
  );
}

async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}
