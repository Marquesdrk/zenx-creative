import { NextResponse } from "next/server";
import { metaIntegrationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { GRAPH_BASE, INSTAGRAM_GRAPH_BASE } from "@/lib/server/meta/config";
import { getReelContainerStatus } from "@/lib/server/meta/instagram";

/** Dados pro modal de diagnóstico da conexão: a conta (sem token) + as últimas etapas
 *  registradas em meta_integration_logs (OAuth, validação, publicação) — inclui erro da Graph
 *  API com endpoint/http_status/error_code/subcode/fbtrace_id quando existir. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await socialAccountsRepo.get(id);
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const logs = await metaIntegrationLogsRepo.listBySocialAccount(id, 30);
  const containerId = new URL(request.url).searchParams.get("containerId");
  if (containerId) {
    const belongsToAccount = logs.some((entry) => entry.metadata.containerId === containerId);
    if (!/^\d+$/.test(containerId) || !belongsToAccount) {
      return NextResponse.json({ error: "Container não encontrado no histórico desta conta." }, { status: 404 });
    }
    const accessToken = await socialAccountsRepo.getAccessToken(id);
    if (!accessToken) {
      return NextResponse.json({ error: "A conta não possui token de acesso válido." }, { status: 503 });
    }
    try {
      const graphBase = account.metadata.authFlow === "instagram_login" ? INSTAGRAM_GRAPH_BASE : GRAPH_BASE;
      const containerStatus = await getReelContainerStatus(containerId, accessToken, graphBase);
      return NextResponse.json({ account, logs, containerStatus: { id: containerId, ...containerStatus } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar o container no Instagram.";
      return NextResponse.json({ account, logs, containerStatusError: message }, { status: 502 });
    }
  }
  return NextResponse.json({ account, logs });
}
