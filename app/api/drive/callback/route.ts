import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/server/google-drive";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectTo = new URL("/configuracoes", url.origin);

  if (!code) {
    redirectTo.searchParams.set("drive_error", "codigo_ausente");
    return NextResponse.redirect(redirectTo);
  }

  try {
    await handleOAuthCallback(code);
    redirectTo.searchParams.set("drive_connected", "1");
  } catch (err) {
    redirectTo.searchParams.set("drive_error", err instanceof Error ? err.message : "erro_desconhecido");
  }

  return NextResponse.redirect(redirectTo);
}
