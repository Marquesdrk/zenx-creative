import { NextResponse } from "next/server";
import { metaOAuthSessionRepo } from "@/lib/server/meta/db";
import { toDiscoveredAssets, type DiscoveredRawPage } from "@/lib/server/meta/pages";
import type { DiscoverySessionSummary } from "@/lib/server/meta/types";

/** Devolve os ativos encontrados numa sessão de descoberta (após o OAuth) — nunca inclui
 *  tokens, só o suficiente pra tela de seleção mostrar "achamos isso, escolha o que
 *  conectar". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");
  if (!sessionId) {
    return NextResponse.json({ error: "Parâmetro 'session' ausente." }, { status: 400 });
  }

  const session = await metaOAuthSessionRepo.get<DiscoveredRawPage[]>(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Sessão de descoberta expirada ou inválida. Conecte de novo." }, { status: 404 });
  }

  const summary: DiscoverySessionSummary = {
    sessionId,
    metaUserId: session.metaUserId,
    expiresAt: session.expiresAt,
    assets: await toDiscoveredAssets(session.discovered),
  };
  return NextResponse.json(summary);
}
