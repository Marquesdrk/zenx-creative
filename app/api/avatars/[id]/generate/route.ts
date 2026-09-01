import { NextResponse } from "next/server";
import { avatarsRepo } from "@/lib/server/avatars-db";
import { runAvatarGeneration } from "@/lib/server/avatar-pipeline";
import { isDriveConnected } from "@/lib/server/google-drive";
import { isOpenAiConnected } from "@/lib/server/openai/client";

// 7 documentos de texto + 4 imagens em sequência via OpenAI, mais o upload de cada uma pro
// Drive — soma facilmente 1-2min. Precisa ficar viva até terminar (ver mesmo padrão em
// app/api/meta/accounts/[id]/test-publish/route.ts).
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const avatar = await avatarsRepo.get(id);
  if (!avatar) return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });

  if (!(await isOpenAiConnected())) {
    return NextResponse.json({ error: "OpenAI não conectada — configure em Configurações." }, { status: 409 });
  }
  if (!(await isDriveConnected())) {
    return NextResponse.json({ error: "Google Drive não conectado — conecte em Configurações." }, { status: 409 });
  }

  await runAvatarGeneration(id);
  const updated = await avatarsRepo.get(id);
  if (updated?.status === "failed") {
    return NextResponse.json({ error: updated.errorMessage ?? "Falha ao gerar o avatar." }, { status: 502 });
  }
  return NextResponse.json(updated);
}
