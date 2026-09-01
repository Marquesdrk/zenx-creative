import { NextResponse } from "next/server";
import { openAiCredentialsRepo } from "@/lib/server/openai/credentials-db";

export async function POST() {
  await openAiCredentialsRepo.clear();
  return NextResponse.json({ ok: true });
}
