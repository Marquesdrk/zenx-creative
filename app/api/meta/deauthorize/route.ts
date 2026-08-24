import { NextResponse } from "next/server";
import { publicationLogsRepo, socialAccountsRepo } from "@/lib/server/db";
import { parseSignedRequest } from "@/lib/server/meta/signed-request";

/** URL de "Deauthorize Callback" configurada nas Configurações Básicas do app na Meta — ela
 *  chama isso quando o usuário remove o app pelas configurações do Facebook (fora do nosso
 *  sistema). Desconecta localmente todas as contas ligadas àquele login, sem apagar histórico. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request ausente." }, { status: 400 });
  }

  try {
    const payload = parseSignedRequest<{ user_id?: string }>(signedRequest);
    if (payload.user_id) {
      const affected = socialAccountsRepo.list().filter((a) => a.metaUserId === payload.user_id && a.status !== "revoked");
      for (const account of affected) {
        socialAccountsRepo.disconnect(account.id);
        publicationLogsRepo.create({
          userId: null,
          scheduledPostId: null,
          socialAccountId: account.id,
          platform: account.platform,
          action: "meta_deauthorize",
          status: "info",
          externalPostId: null,
          errorCode: null,
          errorMessage: null,
          metadata: {},
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao processar." }, { status: 400 });
  }
}
