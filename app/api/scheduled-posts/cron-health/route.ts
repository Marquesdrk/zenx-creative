import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Verifica o segredo de produção sem executar o scheduler nem publicar conteúdo. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET não configurado." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, schedulerEndpoint: "/api/scheduled-posts/run-due" });
}
