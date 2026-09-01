import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { generatedFolder } from "@/lib/server/public-files";

// Cota do plano — não vem de nenhuma API de infraestrutura (Vercel Blob não expõe um limite de
// conta), é o espaço que o Zenx Creative oferece no plano atual. O que É real aqui é o
// usedBytes: soma de fato dos arquivos gerados pelo Zenx (renders/uploads/lotes), medido no
// Vercel Blob em produção ou em disco local em dev. O Google Drive do usuário (lib/server/
// google-drive.ts) nunca entra nessa conta — é armazenamento dele, autenticado à parte, não do
// Zenx (ver docs/META_INTEGRATION_SETUP.md seção 3.1).
const PLAN_QUOTA_BYTES = 50 * 1024 ** 3; // 50 GB

async function localGeneratedBytes(): Promise<number> {
  const kinds = ["uploads", "renders", "batch-space"] as const;
  let total = 0;
  for (const kind of kinds) {
    total += await folderSize(generatedFolder(kind));
  }
  return total;
}

async function folderSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // pasta ainda não existe — 0 bytes usados, não é erro
  }
  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await folderSize(entryPath);
    } else {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function vercelBlobBytes(): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    total += page.blobs.reduce((sum, blob) => sum + blob.size, 0);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return total;
}

export async function GET() {
  let usedBytes = 0;
  try {
    usedBytes = process.env.VERCEL ? await vercelBlobBytes() : await localGeneratedBytes();
  } catch {
    // Sem BLOB_READ_WRITE_TOKEN configurado ou erro de leitura — mostra 0 em vez de quebrar a UI.
    usedBytes = 0;
  }
  return NextResponse.json({
    usedBytes,
    quotaBytes: PLAN_QUOTA_BYTES,
    usedPercent: Math.min(100, Math.round((usedBytes / PLAN_QUOTA_BYTES) * 100)),
  });
}
