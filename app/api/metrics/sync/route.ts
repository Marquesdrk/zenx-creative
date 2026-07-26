import { NextResponse } from "next/server";
import { metricSnapshotsRepo, publicationsRepo } from "@/lib/server/db";
import { ADAPTERS } from "@/lib/server/publishing";

export async function POST() {
  const publications = publicationsRepo.list().filter((p) => p.status === "PUBLISHED" && p.externalId);
  let synced = 0;
  let failed = 0;

  for (const pub of publications) {
    try {
      const adapter = ADAPTERS[pub.platform];
      const metrics = await adapter.fetchMetrics(pub.externalId as string);
      metricSnapshotsRepo.create({
        id: crypto.randomUUID(),
        publicationId: pub.id,
        capturedAt: new Date().toISOString(),
        ...metrics,
      });
      synced++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ synced, failed });
}
