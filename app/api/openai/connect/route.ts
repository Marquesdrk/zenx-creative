import { NextResponse } from "next/server";
import { connectOpenAi } from "@/lib/server/openai/client";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { apiKey?: string } | null;
  if (!body?.apiKey) {
    return NextResponse.json({ error: "Informe a chave de API." }, { status: 400 });
  }
  try {
    await connectOpenAi(body.apiKey.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao conectar com a OpenAI.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
