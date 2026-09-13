import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeZipArchive } from "./zip";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

function readStoredEntries(archive: Buffer) {
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 0xffff - 22); offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP end record not found");

  const count = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);
  const entries: Array<{ filename: string; content: Buffer }> = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("Invalid central directory entry");
    const size = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const filename = archive.toString("utf8", centralOffset + 46, centralOffset + 46 + nameLength);

    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid local file header");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ filename, content: archive.subarray(contentOffset, contentOffset + size) });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("writeZipArchive", () => {
  it("streams stored files into a readable ZIP while preserving UTF-8 names and bytes", async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), "zenx-zip-test-"));
    temporaryFolders.push(folder);
    const firstContent = Buffer.from("video one bytes\0\u0001", "utf8");
    const secondContent = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 251));
    const firstPath = path.join(folder, "first.mp4");
    const secondPath = path.join(folder, "second.mp4");
    const archivePath = path.join(folder, "batch.zip");
    await Promise.all([writeFile(firstPath, firstContent), writeFile(secondPath, secondContent)]);

    await writeZipArchive(
      [
        { filename: "01-ação.mp4", path: firstPath },
        { filename: "02-clip.mp4", path: secondPath },
      ],
      archivePath
    );

    const entries = readStoredEntries(await readFile(archivePath));
    expect(entries.map((entry) => entry.filename)).toEqual(["01-a-o.mp4", "02-clip.mp4"]);
    expect(entries.map((entry) => entry.content)).toEqual([firstContent, secondContent]);
  });
});
