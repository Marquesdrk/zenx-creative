import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { batchesRepo, batchItemsRepo } from "@/lib/server/db";
import { deletePublicUrl, publicUrlToPath } from "@/lib/server/public-files";

function sanitizeDownloadFilename(name: string) {
  const ext = ".mp4";
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "video"}${ext}`;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files: Array<{ filename: string; content: Buffer }>) {
  const { dosTime, dosDate } = dosDateTime();
  const chunks: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.filename, "utf8");
    const checksum = crc32(file.content);
    const size = file.content.length;
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
    ]);

    chunks.push(localHeader, file.content);
    centralDirectory.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(checksum),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ])
    );
    offset += localHeader.length + size;
  }

  const centralDirectoryBuffer = Buffer.concat(centralDirectory);
  return Buffer.concat([
    ...chunks,
    centralDirectoryBuffer,
    Buffer.concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDirectoryBuffer.length),
      u32(offset),
      u16(0),
    ]),
  ]);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = batchesRepo.list().find((candidate) => candidate.id === id);
  if (!batch) {
    return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });
  }

  const batchItems = batchItemsRepo.list().filter((item) => item.batchId === id);
  const completedItems = batchItems.filter((item) => item.status === "COMPLETED" && item.renderedUrl);
  if (completedItems.length === 0) {
    return NextResponse.json({ error: "Renderize ao menos um vídeo antes de exportar o lote." }, { status: 400 });
  }
  if (completedItems.length !== batchItems.length) {
    return NextResponse.json({ error: "Confirme e aguarde todos os vídeos do lote renderizarem antes de exportar." }, { status: 400 });
  }

  const files = await Promise.all(
    completedItems.map(async (item, index) => ({
      filename: sanitizeDownloadFilename(`${String(index + 1).padStart(2, "0")}-${item.filename}`),
      content: await readFile(publicUrlToPath(item.renderedUrl!)),
    }))
  );
  const zip = createZip(files);

  await Promise.all(batchItems.flatMap((item) => [deletePublicUrl(item.contentUrl), deletePublicUrl(item.renderedUrl)]));
  for (const item of batchItems) {
    batchItemsRepo.remove(item.id);
  }
  batchesRepo.remove(id);

  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizeDownloadFilename(`lote-${id}`).replace(/\.mp4$/, ".zip")}"`,
      "X-Removed-Batch-Id": id,
    },
  });
}
