import { NextResponse } from "next/server";
import { getInstagramAppId } from "@/lib/server/meta/config";

/** O convite de Instagram Tester é criado no App Dashboard da Meta, não pela API OAuth.
 *  Esta rota mantém o App ID no servidor e abre diretamente a área de funções da aplicação. */
export async function GET() {
  try {
    const appId = getInstagramAppId();
    return NextResponse.redirect(`https://developers.facebook.com/apps/${appId}/roles/`);
  } catch {
    return NextResponse.json({ error: "META_APP_ID não configurado." }, { status: 503 });
  }
}
