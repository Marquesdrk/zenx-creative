import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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

function updateCrc32(crc: number, buffer: Buffer) {
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
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

export function zipVideoFilename(name: string) {
  return sanitizeDownloadFilename(name);
}

export function zipArchiveFilename(name: string) {
  return sanitizeDownloadFilename(name).replace(/\.mp4$/, ".zip");
}

export function createZip(files: Array<{ filename: string; content: Buffer }>) {
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

type ZipDiskFile = { filename: string; path: string };

async function* zipFileChunks(files: ZipDiskFile[]) {
  if (files.length > 0xffff) throw new Error("O ZIP não pode conter mais de 65.535 arquivos.");

  const { dosTime, dosDate } = dosDateTime();
  const centralDirectory: Buffer[] = [];
  let archiveOffset = 0;

  for (const file of files) {
    const name = Buffer.from(zipVideoFilename(file.filename), "utf8");
    if (name.length > 0xffff) throw new Error("O nome de um vídeo é longo demais para o ZIP.");
    const flags = 0x0808; // UTF-8 names + CRC/sizes in a trailing data descriptor.
    const localHeaderOffset = archiveOffset;
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(0),
      u32(0),
      u32(0),
      u16(name.length),
      u16(0),
      name,
    ]);
    yield localHeader;
    archiveOffset += localHeader.length;
    if (archiveOffset > 0xffffffff) throw new Error("O ZIP ultrapassou o limite de 4 GB. Exporte o lote em partes menores.");

    let crc = 0xffffffff;
    let size = 0;
    for await (const chunk of createReadStream(file.path)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      archiveOffset += bytes.length;
      if (size > 0xffffffff || archiveOffset > 0xffffffff) {
        throw new Error("O ZIP ultrapassou o limite de 4 GB por arquivo. Exporte o lote em partes menores.");
      }
      crc = updateCrc32(crc, bytes);
      yield bytes;
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    const descriptor = Buffer.concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]);
    yield descriptor;
    archiveOffset += descriptor.length;
    if (archiveOffset > 0xffffffff) throw new Error("O ZIP ultrapassou o limite de 4 GB. Exporte o lote em partes menores.");

    centralDirectory.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(flags),
        u16(0),
        u16(dosTime),
        u16(dosDate),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(localHeaderOffset),
        name,
      ])
    );
  }

  const centralDirectoryOffset = archiveOffset;
  for (const record of centralDirectory) {
    yield record;
    archiveOffset += record.length;
  }
  if (archiveOffset > 0xffffffff) throw new Error("O ZIP ultrapassou o limite de 4 GB. Exporte o lote em partes menores.");
  const centralDirectorySize = archiveOffset - centralDirectoryOffset;
  yield Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectorySize),
    u32(centralDirectoryOffset),
    u16(0),
  ]);
}

/** Write a ZIP archive incrementally from files on disk without loading all videos into RAM. */
export async function writeZipArchive(files: ZipDiskFile[], outputPath: string) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(Readable.from(zipFileChunks(files)), createWriteStream(outputPath));
}
