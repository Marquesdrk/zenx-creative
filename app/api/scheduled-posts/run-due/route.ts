import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/server/scheduler";

// Cada invocação executa uma etapa curta e persistida; 60s mantém compatibilidade com
// o limite padrão do plano Hobby da Vercel.
export const maxDuration = 60;

/** Chamado pelo Supabase Cron a cada minuto em produção; não depende de GitHub Actions
 *  nem de um processo local. O endpoint também aceita o disparo manual da UI por rota própria.
 */
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
