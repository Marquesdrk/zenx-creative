import { NextResponse } from "next/server";
import { isDriveConfigured, isDriveConnected } from "@/lib/server/google-drive";

export async function GET() {
  return NextResponse.json({ configured: isDriveConfigured(), connected: isDriveConnected() });
}
