import { NextResponse } from "next/server";

/** Página de status exigida pela Meta para acompanhar um pedido de exclusão de dados — como o
 *  sistema apaga o token e desconecta a conta de forma síncrona ao receber o callback (ver
 *  app/api/meta/data-deletion/route.ts), qualquer código aqui já corresponde a uma exclusão
 *  concluída. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "desconhecido";
  return NextResponse.json({ status: "completo", confirmation_code: code });
}
