import { NextResponse } from "next/server";
import { socialAccountsRepo } from "@/lib/server/db";
import { checkAccountToken } from "@/lib/server/meta/token";

/** Botão "Verificar conexão" na tela de Contas Meta — checa o token contra /debug_token e
 *  atualiza o status da conta (connected/expired/revoked) na hora, sem esperar a próxima
 *  publicação falhar pra descobrir que o token caiu. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = socialAccountsRepo.get(id);
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  const result = await checkAccountToken(id);
  return NextResponse.json({ ...result, account: socialAccountsRepo.get(id) });
}
