import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectSkillArchive } from "./community-archive.js";

type Entry = { name: string; content?: string | Buffer; method?: 0 | 8; descriptor?: boolean; mode?: number };

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Produce ZIP records directly, so tests work without an installed zip executable.
function zip(entries: Entry[]): Buffer {
  const localParts: Buffer[] = []; const centralParts: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const content = Buffer.from(entry.content ?? "");
    const method = entry.method ?? 0; const compressed = method === 8 ? deflateRawSync(content) : content;
    const checksum = crc32(content); const flags = entry.descriptor ? 8 : 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!entry.descriptor) {
      local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(content.length, 22);
    }
    local.writeUInt16LE(name.length, 26);
    const descriptor = entry.descriptor ? Buffer.alloc(16) : Buffer.alloc(0);
    if (entry.descriptor) {
      descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(checksum, 4);
      descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(content.length, 12);
    }
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(((entry.mode ?? 0x81a4) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, compressed, descriptor); centralParts.push(central, name);
    offset += local.length + name.length + compressed.length + descriptor.length;
  }
  const directory = Buffer.concat(centralParts); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function patch(input: Buffer, edit: (bytes: Buffer, central: number, end: number) => void): Buffer {
  const bytes = Buffer.from(input);
  edit(bytes, bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])), bytes.length - 22);
  return bytes;
}
const valid = () => zip([{ name: "SKILL.md", content: "hello", method: 8 }]);

describe("Skill ZIP inspection", () => {
  it("accepts stored files, directories, and deflated files with data descriptors", () => {
    expect(inspectSkillArchive(zip([
      { name: "nested/", mode: 0x41ed }, { name: "nested/SKILL.md", content: "# Full\n", method: 8, descriptor: true },
      { name: "nested/ref.txt", content: "reference" },
    ]))).toEqual({ skill_path: "nested/SKILL.md", skill_content: "# Full\n", entries: ["nested/", "nested/SKILL.md", "nested/ref.txt"] });
  });

  it("accepts descriptors without their optional signature and a ZIP comment", () => {
    const original = zip([{ name: "SKILL.md", content: "Hello", method: 8, descriptor: true }]);
    const descriptor = original.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
    const withoutSignature = Buffer.concat([original.subarray(0, descriptor), original.subarray(descriptor + 4)]);
    const end = withoutSignature.length - 22;
    withoutSignature.writeUInt32LE(withoutSignature.readUInt32LE(end + 16) - 4, end + 16);
    const comment = Buffer.from("Archive comment"); withoutSignature.writeUInt16LE(comment.length, end + 20);
    expect(inspectSkillArchive(Buffer.concat([withoutSignature, comment]))).toEqual({
      skill_path: "SKILL.md", skill_content: "Hello", entries: ["SKILL.md"],
    });
  });
  it("accepts regular DOS-created ZIP members", () => {
    const archive = patch(zip([{ name: "SKILL.md", content: "Windows" }]), (b, c) => {
      b.writeUInt16LE(20, c + 4); b.writeUInt32LE(0x20, c + 38);
    });
    expect(inspectSkillArchive(archive)).toEqual({ skill_path: "SKILL.md", skill_content: "Windows", entries: ["SKILL.md"] });
  });
  it("keeps Unicode paths and the complete UTF-8 Skill text", () => {
    const content = "﻿# 技能\n完整内容 🛠\n";
    expect(inspectSkillArchive(zip([{ name: "嵌套/SKILL.md", content }]))).toEqual({
      skill_path: "嵌套/SKILL.md", skill_content: content, entries: ["嵌套/SKILL.md"],
    });
  });
  it.each(["", "  \n\t"])("rejects an empty or whitespace-only SKILL.md", (content) => {
    expect(() => inspectSkillArchive(zip([{ name: "SKILL.md", content }]))).toThrowError(expect.objectContaining({ code: "invalid_file" }));
  });
  it("rejects a total decompressed size above 50 MiB", () => {
    const block = Buffer.alloc(10 * 1024 ** 2, 65);
    const archive = zip([{ name: "SKILL.md", content: "x" },
      ...Array.from({ length: 5 }, (_, i) => ({ name: `large${i}`, content: block, method: 8 as const }))]);
    expect(() => inspectSkillArchive(archive)).toThrowError(expect.objectContaining({ code: "invalid_file" }));
  }, 15000);

  it.each([
    ["missing SKILL.md", () => zip([{ name: "README.md", content: "other" }])],
    ["multiple SKILL.md files", () => zip([{ name: "a/SKILL.md" }, { name: "b/SKILL.md" }])],
    ["duplicate member paths", () => zip([{ name: "SKILL.md" }, { name: "SKILL.md" }])],
    ["duplicate normalized paths", () => zip([{ name: "SKILL.md" }, { name: "./SKILL.md" }])],
    ["path traversal", () => zip([{ name: "SKILL.md" }, { name: "../escape" }])],
    ["absolute paths", () => zip([{ name: "SKILL.md" }, { name: "/escape" }])],
    ["Windows paths", () => zip([{ name: "SKILL.md" }, { name: "C:\\escape" }])],
    ["Windows reserved names", () => zip([{ name: "SKILL.md", content: "valid" }, { name: "nested/CON.txt" }])],
    ["symbolic links", () => zip([{ name: "SKILL.md" }, { name: "link", content: "../outside", mode: 0xa1ff }])],
    ["symbolic links marked as macOS", () => patch(zip([{ name: "SKILL.md" }, { name: "link", content: "../outside", mode: 0xa1ff }]), (b, c) => {
      const second = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), c + 4); b.writeUInt16LE(0x1314, second + 4);
    })],
    ["a file marked as a DOS directory", () => patch(valid(), (b, c) => b.writeUInt32LE((b.readUInt32LE(c + 38) | 0x10) >>> 0, c + 38))],
    ["a file that is also a parent directory", () => zip([{ name: "SKILL.md" }, { name: "scripts" }, { name: "scripts/a.js" }])],
    ["an unlisted local member", () => {
      const b = zip([{ name: "SKILL.md", content: "hello" }, { name: "hidden.js", content: "unlisted" }]);
      const end = b.length - 22; const central = b.readUInt32LE(end + 16);
      const second = b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), central + 4);
      const result = Buffer.concat([b.subarray(0, second), b.subarray(end)]); const newEnd = result.length - 22;
      result.writeUInt16LE(1, newEnd + 8); result.writeUInt16LE(1, newEnd + 10); result.writeUInt32LE(second - central, newEnd + 12);
      return result;
    }],
    ["a damaged central signature", () => patch(valid(), (b, c) => b.writeUInt32LE(0, c))],
    ["a mismatched local name", () => patch(valid(), b => { b[30] ^= 1; })],
    ["a mismatched local size", () => patch(valid(), b => b.writeUInt32LE(1, 22))],
    ["a bad CRC", () => { const b = zip([{ name: "SKILL.md", content: "hello" }]); b[30 + "SKILL.md".length] ^= 1; return b; }],
    ["encrypted members", () => patch(valid(), (b, c) => { b.writeUInt16LE(1, 6); b.writeUInt16LE(1, c + 8); })],
    ["unsupported compression", () => patch(valid(), (b, c) => { b.writeUInt16LE(99, 8); b.writeUInt16LE(99, c + 10); })],
    ["multi-disk archives", () => patch(valid(), (b, _c, e) => b.writeUInt16LE(1, e + 4))],
    ["ZIP64 records", () => patch(valid(), (b, _c, e) => b.writeUInt16LE(0xffff, e + 10))],
    ["out-of-bounds local records", () => patch(valid(), (b, c) => b.writeUInt32LE(0xffffff00, c + 42))],
    ["too many entries", () => zip([{ name: "SKILL.md" }, ...Array.from({ length: 1000 }, (_, i) => ({ name: `f${i}` }))])],
    ["oversized decompressed data", () => zip([{ name: "SKILL.md", content: Buffer.alloc(10 * 1024 ** 2 + 1, 65), method: 8 }])],
    ["deflate data larger than its claimed size", () => patch(zip([{ name: "SKILL.md", content: Buffer.alloc(2 * 1024 ** 2, 65), method: 8 }]), (b, c) => { b.writeUInt32LE(1, 22); b.writeUInt32LE(1, c + 24); })],
  ])("rejects %s", (_label, makeArchive) => {
    expect(() => inspectSkillArchive(makeArchive())).toThrowError(expect.objectContaining({ code: "invalid_file" }));
  });
});
