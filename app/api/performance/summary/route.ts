import { NextResponse } from "next/server";
import { batchesRepo, batchItemsRepo, metricSnapshotsRepo, profilesRepo, publicationsRepo } from "@/lib/server/db";
import { PLATFORM_LABELS } from "@/lib/editor/types";

export async function GET() {
  const publications = publicationsRepo.list().filter((p) => p.status === "PUBLISHED");
  const latestSnapshots = metricSnapshotsRepo.listLatestPerPublication();
  const items = batchItemsRepo.list();
  const batches = batchesRepo.list();
  const profiles = profilesRepo.list();

  const rows = publications.map((pub) => {
    const item = items.find((i) => i.id === pub.batchItemId);
    const batch = item ? batches.find((b) => b.id === item.batchId) : undefined;
    const profile = batch ? profiles.find((p) => p.id === batch.profileId) : undefined;
    const metrics = latestSnapshots.find((m) => m.publicationId === pub.id);
    return {
      publicationId: pub.id,
      platformLabel: PLATFORM_LABELS[pub.platform],
      profileName: profile?.name ?? "—",
      filename: item?.filename ?? "—",
      permalink: pub.permalink,
      publishedAt: pub.publishedAt,
      views: metrics?.views ?? 0,
      likes: metrics?.likes ?? 0,
      comments: metrics?.comments ?? 0,
      shares: metrics?.shares ?? 0,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      views: acc.views + row.views,
      likes: acc.likes + row.likes,
      comments: acc.comments + row.comments,
      shares: acc.shares + row.shares,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 }
  );

  return NextResponse.json({ rows, totals });
}
