import { NextResponse } from "next/server";
import { avatarsRepo } from "@/lib/server/avatars-db";
import type { AvatarInput } from "@/lib/server/avatar-types";
import type { Engine } from "@/lib/editor/types";

export async function GET() {
  return NextResponse.json(await avatarsRepo.list());
}

type CreateBody = AvatarInput & { engine: Engine };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body?.name || !body.engine) {
    return NextResponse.json({ error: "Informe ao menos o nome e o engine do avatar." }, { status: 400 });
  }
  const avatar = await avatarsRepo.create(body);
  return NextResponse.json(avatar, { status: 201 });
}
