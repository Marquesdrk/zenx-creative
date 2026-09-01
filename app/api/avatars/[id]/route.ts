import { NextResponse } from "next/server";
import { avatarsRepo } from "@/lib/server/avatars-db";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const avatar = await avatarsRepo.get(id);
  if (!avatar) return NextResponse.json({ error: "Avatar não encontrado." }, { status: 404 });
  return NextResponse.json(avatar);
}

type PatchBody = { profileId?: string | null };

/** Só usado para ligar o avatar ao perfil criado no editor (perfis vivem no navegador, ver
 *  lib/editor/profiles-store.ts — o cliente cria o perfil e avisa aqui pra guardar a referência). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  await avatarsRepo.update(id, { profileId: body.profileId ?? null });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await avatarsRepo.remove(id);
  return NextResponse.json({ ok: true });
}
