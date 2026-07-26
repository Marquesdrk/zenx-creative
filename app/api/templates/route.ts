import { NextResponse } from "next/server";
import { templatesRepo } from "@/lib/server/db";
import type { Template } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(templatesRepo.list());
}

/** Sincroniza a lista inteira, mesma semântica de /api/profiles. */
export async function PUT(request: Request) {
  const templates = (await request.json()) as Template[];
  const currentIds = new Set(templatesRepo.list().map((t) => t.id));
  const nextIds = new Set(templates.map((t) => t.id));
  for (const id of currentIds) {
    if (!nextIds.has(id)) templatesRepo.remove(id);
  }
  for (const template of templates) {
    templatesRepo.upsert(template);
  }
  return NextResponse.json(templatesRepo.list());
}
