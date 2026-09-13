import { NextResponse } from "next/server";
import { editorProfilesRepo } from "@/lib/server/editor-store-db";
import { batchesRepo, batchItemsRepo, publicationsRepo } from "@/lib/server/db";
import { scheduledPostAccountsRepo, scheduledPostsRepo, socialAccountsRepo } from "@/lib/server/meta/db";
import { buildContentCoverageReport } from "@/lib/reports/content-coverage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [profiles, scheduledPosts, scheduledPostAccounts, socialAccounts] = await Promise.all([
      editorProfilesRepo.list(),
      scheduledPostsRepo.list(),
      scheduledPostAccountsRepo.listAll(),
      socialAccountsRepo.list(),
    ]);
    const report = buildContentCoverageReport({
      profiles,
      batches: batchesRepo.list(),
      items: batchItemsRepo.list(),
      publications: publicationsRepo.list(),
      scheduledPosts,
      scheduledPostAccounts,
      socialAccounts,
    });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[relatorio] content coverage failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível carregar o relatório." },
      { status: 503 }
    );
  }
}
