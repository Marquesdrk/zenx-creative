import { NextResponse } from "next/server";
import { publicationLogsRepo, socialAccountsRepo } from "@/lib/server/db";

/** Desconectar uma conta: revoga localmente e apaga o token guardado (ver
 *  socialAccountsRepo.disconnect) sem tocar em nenhuma outra conta nem apagar o histórico de
 *  publicações associado a ela. Reconectar é feito clicando "Conectar Meta" de novo e
 *  reselecionando o mesmo ativo — o upsert por (platform, platform_account_id) atualiza esta
 *  mesma linha em vez de criar uma duplicata. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = socialAccountsRepo.get(id);
  if (!account) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }

  socialAccountsRepo.disconnect(id);
  publicationLogsRepo.create({
    userId: null,
    scheduledPostId: null,
    socialAccountId: id,
    platform: account.platform,
    action: "oauth_disconnect",
    status: "success",
    externalPostId: null,
    errorCode: null,
    errorMessage: null,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
