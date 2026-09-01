import { NextResponse } from "next/server";
import { isOpenAiConnected } from "@/lib/server/openai/client";

export async function GET() {
  return NextResponse.json({ connected: await isOpenAiConnected() });
}
