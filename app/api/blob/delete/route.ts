import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isAllowedTemporaryBlob(url: string) {
  return /\/(editor-batches|editor-assets)\//.test(url);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(body?.urls) ? body.urls.filter((url): url is string => typeof url === "string") : [];
  const allowedUrls = urls.filter(isAllowedTemporaryBlob);

  await Promise.all(allowedUrls.map((url) => del(url).catch(() => {})));

  return NextResponse.json({ deleted: allowedUrls.length });
}
