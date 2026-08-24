import { NextResponse } from "next/server";
import { publicationLogsRepo, socialAccountsRepo } from "@/lib/server/db";
import { getPublicBaseUrl } from "@/lib/server/meta/config";
import { parseSignedRequest } from "@/lib/server/meta/signed-request";

/** URL de "Data Deletion Request Callback" configurada nas Configurações Básicas do app na
 *  Meta. Formato de resposta exigido pela Meta: JSON com `url` (uma página que a pessoa pode
 *  visitar pra ver o status) e `confirmation_code`. Desconecta e apaga o token de todas as
 *  contas ligadas ao login que pediu a exclusão. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request");
  if (typeof signedRequest !== "string") {
    return NextResponse.json({ error: "signed_request ausente." }, { status: 400 });
  }

  const confirmationCode = crypto.randomUUID();

  try {
    const payload = parseSignedRequest<{ user_id?: string }>(signedRequest);
    if (payload.user_id) {
      const affected = socialAccountsRepo.list().filter((a) => a.metaUserId === payload.user_id);
      for (const account of affected) {
        socialAccountsRepo.disconnect(account.id);
        publicationLogsRepo.create({
          userId: null,
          scheduledPostId: null,
          socialAccountId: account.id,
          platform: account.platform,
          action: "meta_data_deletion",
          status: "info",
          externalPostId: null,
          errorCode: null,
          errorMessage: null,
          metadata: { confirmationCode },
        });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Falha ao processar." }, { status: 400 });
  }

  let statusUrl = `/api/meta/data-deletion/status?code=${confirmationCode}`;
  try {
    statusUrl = `${getPublicBaseUrl()}${statusUrl}`;
  } catch {
    // PUBLIC_BASE_URL ainda não configurada — devolve o caminho relativo mesmo assim; ajuste
    // antes de submeter o app pra revisão (a Meta precisa conseguir acessar essa URL).
  }

  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode });
}
