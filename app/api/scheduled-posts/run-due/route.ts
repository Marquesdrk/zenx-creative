import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/server/scheduler";

// O scheduler processa vídeos aguardando publicação (agendados ou em retry) e pode levar mais
// de 1min com muitas contas — em serverless a função precisa ficar viva até terminar (Hobby
// tem teto bem menor que isso; Pro suporta até 300s aqui).
export const maxDuration = 300;

/** Disparado periodicamente por um agendador — ver vercel.json (Vercel Cron Jobs) ou, fora da
 *  Vercel, cron do SO / serviço de ping externo (docs/META_INTEGRATION_SETUP.md, seção 8).
 *  Também pode ser chamado manualmente pelo botão "Rodar pendentes" na tela de Publicar.
 *  Protegido por CRON_SECRET quando definido: a Vercel envia automaticamente
 *  `Authorization: Bearer $CRON_SECRET` nas chamadas do Cron Jobs configurado — qualquer outra
 *  chamada sem esse header é rejeitada, pra ninguém disparar publicações de fora sem querer. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }
  const result = await runDueScheduledPosts();
  return NextResponse.json(result);
}

/** Vercel Cron Jobs só suporta GET por padrão — aceitamos GET como alias de POST pra esse caso,
 *  mantendo POST livre pro botão manual "Rodar pendentes" da UI (fetch simples, sem header). */
export async function GET(request: Request) {
  return POST(request);
}
