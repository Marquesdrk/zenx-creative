import { NextResponse } from "next/server";
import { canReadAllDriveFiles, isDriveConfigured, isDriveConnected } from "@/lib/server/google-drive";

export async function GET() {
  const connected = await isDriveConnected();
  return NextResponse.json({
    configured: isDriveConfigured(),
    connected,
    canReadAllFiles: connected && (await canReadAllDriveFiles()),
  });
}
