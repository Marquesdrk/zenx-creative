type ZipFile = {
  filename: string;
  content: Uint8Array;
};

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

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
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

function bytesFromValues(values: number[]) {
  const bytes = new Uint8Array(values.length);
  values.forEach((value, index) => {
    bytes[index] = value & 0xff;
  });
  return bytes;
}

function u16(value: number) {
  return bytesFromValues([value, value >> 8]);
}

function u32(value: number) {
  return bytesFromValues([value, value >> 8, value >> 16, value >> 24]);
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function zipVideoFilename(name: string) {
  return sanitizeDownloadFilename(name);
}

export function zipArchiveFilename(name: string) {
  return sanitizeDownloadFilename(name).replace(/\.mp4$/, ".zip");
}

export function createZipBlob(files: ZipFile[]) {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = dosDateTime();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.filename);
    const checksum = crc32(file.content);
    const size = file.content.length;
    const localHeader = concatBytes([
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
      concatBytes([
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

  const centralDirectoryBuffer = concatBytes(centralDirectory);
  return new Blob(
    [
      concatBytes([
        ...chunks,
        centralDirectoryBuffer,
        concatBytes([
          u32(0x06054b50),
          u16(0),
          u16(0),
          u16(files.length),
          u16(files.length),
          u32(centralDirectoryBuffer.length),
          u32(offset),
          u16(0),
        ]),
      ]),
    ],
    { type: "application/zip" }
  );
}
