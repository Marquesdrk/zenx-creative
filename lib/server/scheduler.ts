import { scheduledPostAccountsRepo } from "@/lib/server/db";
import { processScheduledPostAccount } from "@/lib/server/meta/publish";

// Quantos destinos processar em paralelo por rodada do scheduler — mantém boa vazão com
// 30-100 contas conectadas sem disparar tudo de uma vez contra a Graph API (rate limit).
const CONCURRENCY = 5;

/** Ponto de entrada do agendador: busca todos os destinos "due" — agendados pra agora (ou
 *  antes) e ainda não processados, incluindo retries cujo next_attempt_at já passou — e
 *  publica cada um. Deve ser chamado periodicamente por um disparador externo (cron do SO,
 *  Vercel Cron, um serviço de ping como cron-job.org, etc. — ver
 *  docs/META_INTEGRATION_SETUP.md, seção "Scheduler em produção"; não há Supabase Cron aqui
 *  porque o banco deste projeto é SQLite local, não Postgres).
 *
 *  Idempotente e seguro contra chamadas concorrentes/repetidas: scheduledPostAccountsRepo
 *  .claim() garante que cada destino só é processado por uma execução, então rodar isso em
 *  paralelo (ou com um cron mal configurado disparando duas vezes) nunca publica a mesma
 *  coisa duas vezes. */
export async function runDueScheduledPosts(): Promise<{ processed: number }> {
  const now = new Date().toISOString();
  const due = scheduledPostAccountsRepo.listDue(now);
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
