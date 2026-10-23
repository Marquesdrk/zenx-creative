import { NextResponse } from "next/server";
import { inspectProfile } from "@/lib/server/video-downloader";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown; limit?: unknown };
    if (typeof body.url !== "string") return NextResponse.json({ error: "Informe a URL de um perfil." }, { status: 400 });
    const result = await inspectProfile(body.url, typeof body.limit === "number" ? body.limit : 50);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível consultar o perfil." }, { status: 400 });
  }
}
