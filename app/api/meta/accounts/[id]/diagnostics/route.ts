import { NextResponse } from "next/server";
import { metaIntegrationLogsRepo, socialAccountsRepo } from "@/lib/server/meta/db";

/** Dados pro modal de diagnóstico da conexão: a conta (sem token) + as últimas etapas
 *  registradas em meta_integration_logs (OAuth, validação, publicação) — inclui erro da Graph
 *  API com endpoint/http_status/error_code/subcode/fbtrace_id quando existir. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await socialAccountsRepo.get(id);
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const logs = await metaIntegrationLogsRepo.listBySocialAccount(id, 30);
  return NextResponse.json({ account, logs });
}
