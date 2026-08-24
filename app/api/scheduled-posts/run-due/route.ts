import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/server/scheduler";

/** Disparado periodicamente por um agendador externo (cron do SO, Vercel Cron, um serviço de
 *  ping como cron-job.org, etc. — ver docs/META_INTEGRATION_SETUP.md). Também pode ser
 *  chamado manualmente pelo botão "Rodar pendentes" na tela de Publicar, do mesmo jeito que o
 *  Calendário antigo já faz para o fluxo de Publication legado. */
export async function POST() {
  const result = await runDueScheduledPosts();
  return NextResponse.json(result);
}
