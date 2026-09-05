import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/server/scheduler";

// O scheduler processa vídeos aguardando publicação (agendados ou em retry) e pode levar mais
// de 1min com muitas contas — em serverless a função precisa ficar viva até terminar (Hobby
// tem teto bem menor que isso; Pro suporta até 300s aqui).
export const maxDuration = 300;

/** Disparado periodicamente por um agendador externo — o workflow em
 *  .github/workflows/run-scheduled-posts.yml chama isso a cada 5min via POST com
 *  `Authorization: Bearer $CRON_SECRET`; vercel.json também tem um Cron Job diário como rede
 *  de segurança (via GET, com o mesmo header, injetado automaticamente pela Vercel). Protegido
 *  por CRON_SECRET quando definido — sem isso, qualquer um que descobrisse essa URL pública
 *  poderia disparar publicações à força. Para o botão "Rodar pendentes" da UI (que não deve
 *  carregar esse segredo pro navegador), use /api/scheduled-posts/run-due-manual. */
function assertAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const unauthorized = assertAuthorized(request);
  if (unauthorized) return unauthorized;
  const result = await runDueScheduledPosts();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
