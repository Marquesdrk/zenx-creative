import { statfs } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: "A verificação de disco só está disponível no modo local." }, { status: 410 });
  }

  try {
    const disk = await statfs(process.cwd());
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    return NextResponse.json(
      { freeBytes },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar espaço em disco.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
