import { NextResponse } from "next/server";
import { publicationsRepo } from "@/lib/server/db";
import { publishPublication } from "@/lib/server/publishing-runner";

export async function POST() {
  const due = publicationsRepo.listDue(new Date().toISOString());
  const published = await Promise.all(due.map((publication) => publishPublication(publication.id)));
  return NextResponse.json({ count: published.length, publications: published });
}
