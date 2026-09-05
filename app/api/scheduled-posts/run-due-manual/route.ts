import { NextResponse } from "next/server";
import { runDueScheduledPosts } from "@/lib/server/scheduler";

export const maxDuration = 300;

/** Mesmo trabalho de /api/scheduled-posts/run-due, mas sem exigir CRON_SECRET — é o que o
 *  botão "Rodar pendentes" da tela de Publicar/Calendário chama, e um fetch do navegador nunca
 *  deveria carregar esse segredo (ficaria visível no bundle do client). Esse app não tem
 *  login, então isso não abre uma porta nova: quem já consegue abrir o dashboard já consegue
 *  clicar no botão de qualquer forma — só evita que a URL "oficial" de cron fique aberta pra
 *  qualquer bot que a descubra na internet. */
export async function POST() {
  const result = await runDueScheduledPosts();
  return NextResponse.json(result);
}
