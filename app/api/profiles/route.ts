import { NextResponse } from "next/server";
import { profilesRepo } from "@/lib/server/db";
import type { Profile } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(profilesRepo.list());
}

/** Sincroniza a lista inteira: cria/atualiza os perfis enviados e remove os que não vieram
 *  no payload — espelha a semântica anterior de "substituir o array" do localStorage. */
export async function PUT(request: Request) {
  const profiles = (await request.json()) as Profile[];
  const currentIds = new Set(profilesRepo.list().map((p) => p.id));
  const nextIds = new Set(profiles.map((p) => p.id));
  for (const id of currentIds) {
    if (!nextIds.has(id)) profilesRepo.remove(id);
  }
  for (const profile of profiles) {
    profilesRepo.upsert(profile);
  }
  return NextResponse.json(profilesRepo.list());
}
