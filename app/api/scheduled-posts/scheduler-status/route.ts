import { NextResponse } from "next/server";
import {
  ensureLocalScheduledPostScheduler,
  getScheduledPostSchedulerState,
} from "@/lib/server/scheduler-runtime";
import { scheduledPostAccountsRepo } from "@/lib/server/meta/db";

export const dynamic = "force-dynamic";

/** Diagnóstico local, somente leitura: nunca executa nem publica posts. */
export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return NextResponse.json({ error: "Diagnóstico disponível somente no servidor local." }, { status: 404 });
  }

  // Também cobre o caso em que o servidor dev foi iniciado antes da alteração em
  // instrumentation.ts e o hot reload não executou novamente o hook de inicialização.
  await ensureLocalScheduledPostScheduler();

  let database: { reachable: true; dueCount: number } | { reachable: false; error: string };
  try {
    const due = await scheduledPostAccountsRepo.listDue(new Date().toISOString());
    database = { reachable: true, dueCount: due.length };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const causeText = cause instanceof Error ? `${cause.name}: ${cause.message}` : "";
    database = {
      reachable: false,
      error: [error instanceof Error ? error.message : String(error), causeText].filter(Boolean).join("; "),
    };
  }

  let directRest: string;
  try {
    const url = `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/rest/v1/scheduled_posts?select=id&limit=1`;
    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
      cache: "no-store",
    });
    directRest = `HTTP ${response.status}`;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    directRest = [error instanceof Error ? error.message : String(error), cause instanceof Error ? cause.message : ""].filter(Boolean).join("; ");
  }

  return NextResponse.json({
    runtime: process.env.NEXT_RUNTIME ?? "unknown",
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    database,
    directRest,
    scheduler: getScheduledPostSchedulerState(),
  });
}
