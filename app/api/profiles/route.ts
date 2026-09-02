import { NextResponse } from "next/server";
import { editorProfilesRepo } from "@/lib/server/editor-store-db";
import type { Profile } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(await editorProfilesRepo.list());
}

/** Sincroniza a lista inteira: cria/atualiza os perfis enviados e remove os que não vieram
 *  no payload — espelha a semântica anterior de "substituir o array" do localStorage. */
export async function PUT(request: Request) {
  const profiles = (await request.json()) as Profile[];
  const current = await editorProfilesRepo.list();
  const nextIds = new Set(profiles.map((p) => p.id));
  await Promise.all([
    ...current.filter((p) => !nextIds.has(p.id)).map((p) => editorProfilesRepo.remove(p.id)),
    ...profiles.map((profile) => editorProfilesRepo.upsert(profile)),
  ]);
  return NextResponse.json(await editorProfilesRepo.list());
}
