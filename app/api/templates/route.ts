import { NextResponse } from "next/server";
import { editorTemplatesRepo } from "@/lib/server/editor-store-db";
import type { Template } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(await editorTemplatesRepo.list());
}

/** Sincroniza a lista inteira, mesma semântica de /api/profiles. */
export async function PUT(request: Request) {
  const templates = (await request.json()) as Template[];
  const current = await editorTemplatesRepo.list();
  const nextIds = new Set(templates.map((t) => t.id));
  await Promise.all([
    ...current.filter((t) => !nextIds.has(t.id)).map((t) => editorTemplatesRepo.remove(t.id)),
    ...templates.map((template) => editorTemplatesRepo.upsert(template)),
  ]);
  return NextResponse.json(await editorTemplatesRepo.list());
}
