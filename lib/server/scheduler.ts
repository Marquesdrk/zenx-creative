import { scheduledPostAccountsRepo } from "@/lib/server/meta/db";
import { processScheduledPostAccount } from "@/lib/server/meta/publish";

// Quantos destinos processar em paralelo por rodada do scheduler — mantém boa vazão com
// 30-100 contas conectadas sem disparar tudo de uma vez contra a Graph API (rate limit).
const CONCURRENCY = 5;

/** Ponto de entrada do agendador: busca no Supabase os destinos "due" — agendados pra agora
 *  (ou antes) e ainda não processados, incluindo retries cujo next_attempt_at já passou — e
 *  publica cada um. No servidor local persistente, instrumentation.ts chama esta função a
 *  cada minuto. Em produção, o Supabase Cron chama /api/scheduled-posts/run-due a cada minuto;
 *  não há dependência de processo local nem de GitHub Actions.
 *
 *  Idempotente e seguro contra chamadas concorrentes/repetidas: scheduledPostAccountsRepo
 *  .claim() garante que cada destino só é processado por uma execução, então rodar isso em
 *  paralelo (ou com um cron mal configurado disparando duas vezes) nunca publica a mesma
 *  coisa duas vezes. */
export async function runDueScheduledPosts(): Promise<{ processed: number }> {
  const now = new Date().toISOString();
  const due = await scheduledPostAccountsRepo.listDue(now);
  if (due.length === 0) return { processed: 0 };

  let cursor = 0;
  async function worker() {
    while (cursor < due.length) {
      const current = due[cursor++];
      await processScheduledPostAccount(current.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));

  return { processed: due.length };
}
