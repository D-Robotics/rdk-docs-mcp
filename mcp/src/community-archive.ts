import { inflateRawSync } from "node:zlib";
import { CommunityError } from "./community-types.js";

export type SkillArchivePreview = { skill_path: string; skill_content: string; entries: string[] };

// These limits apply to actual decompressed data as well as the directory metadata.
const MAX_ENTRIES = 1000;
const MAX_ENTRY_BYTES = 10 * 1024 ** 2;
const MAX_TOTAL_BYTES = 50 * 1024 ** 2;
const LOCAL = 0x04034b50; const CENTRAL = 0x02014b50; const END = 0x06054b50; const DESCRIPTOR = 0x08074b50;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function invalid(message: string): never {
  throw new CommunityError("invalid_file", `Invalid Skill ZIP: ${message}`);
}
function bounds(offset: number, length: number, limit: number): void {
  if (offset < 0 || length < 0 || offset > limit || length > limit - offset) invalid("record exceeds archive bounds.");
}
function utf8(bytes: Buffer): string {
  try { return decoder.decode(bytes); } catch { return invalid("member names and SKILL.md must be UTF-8."); }
}
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function validateExtras(extra: Buffer, name: Buffer): void {
  for (let offset = 0; offset < extra.length;) {
    bounds(offset, 4, extra.length);
    const id = extra.readUInt16LE(offset); const length = extra.readUInt16LE(offset + 2);
    offset += 4; bounds(offset, length, extra.length);
    if (id === 0x0001) invalid("ZIP64 is not supported.");
    if (id === 0x9901) invalid("encrypted archives are not supported.");
    // Unicode path extras must not supply a different path to another ZIP reader.
    if (id === 0x7075) {
      if (length < 5 || extra[offset] !== 1 || extra.readUInt32LE(offset + 1) !== crc32(name) ||
          utf8(extra.subarray(offset + 5, offset + length)) !== utf8(name)) invalid("ambiguous Unicode member path.");
    }
    offset += length;
  }
}

function safePath(name: string): { key: string; directory: boolean } {
  if (!name || name.startsWith("/") || name.includes("\\") || /[:\x00-\x1f\x7f]/.test(name)) invalid("unsafe member path.");
  const directory = name.endsWith("/");
  const components = name.split("/");
  if (directory) components.pop();
  while (components[0] === ".") components.shift();
  if (!components.length || components.some(part => !part || part === ".." || part === "." || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i.test(part))) invalid("unsafe member path.");
  return { key: components.join("/").normalize("NFC").toLowerCase(), directory };
}

function endRecord(data: Buffer): number {
  // A ZIP comment may contain the end signature; only a record ending at EOF counts.
  for (let offset = data.length - 22; offset >= Math.max(0, data.length - 22 - 0xffff); offset--) {
    if (data.readUInt32LE(offset) === END && offset + 22 + data.readUInt16LE(offset + 20) === data.length) return offset;
  }
  return invalid("end of central directory not found.");
}

export function inspectSkillArchive(data: Buffer): SkillArchivePreview {
  if (data.length < 22 || data.readUInt32LE(0) !== LOCAL) invalid("expected a ZIP archive.");
  const end = endRecord(data);
  const disk = data.readUInt16LE(end + 4); const centralDisk = data.readUInt16LE(end + 6);
  const diskCount = data.readUInt16LE(end + 8); const count = data.readUInt16LE(end + 10);
  const centralSize = data.readUInt32LE(end + 12); const centralStart = data.readUInt32LE(end + 16);
  if (count === 0xffff || diskCount === 0xffff || centralSize === 0xffffffff || centralStart === 0xffffffff) invalid("ZIP64 is not supported.");
  if (disk !== 0 || centralDisk !== 0 || diskCount !== count) invalid("multi-disk archives are not supported.");
  if (count > MAX_ENTRIES) invalid(`more than ${MAX_ENTRIES} members.`);
  bounds(centralStart, centralSize, end);
  if (centralStart + centralSize !== end) invalid("invalid central directory size.");

  const entries: string[] = []; const paths = new Map<string, boolean>();
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = centralStart; let total = 0; let skillPath: string | undefined; let skillContent: string | undefined;
  for (let i = 0; i < count; i++) {
    bounds(cursor, 46, end);
    if (data.readUInt32LE(cursor) !== CENTRAL) invalid("invalid central directory entry.");
    const version = data.readUInt16LE(cursor + 6);
    const flags = data.readUInt16LE(cursor + 8); const method = data.readUInt16LE(cursor + 10);
    const checksum = data.readUInt32LE(cursor + 16); const compressedSize = data.readUInt32LE(cursor + 20);
    const size = data.readUInt32LE(cursor + 24); const nameLength = data.readUInt16LE(cursor + 28);
    const extraLength = data.readUInt16LE(cursor + 30); const commentLength = data.readUInt16LE(cursor + 32);
    const diskStart = data.readUInt16LE(cursor + 34); const attrs = data.readUInt32LE(cursor + 38);
    const localOffset = data.readUInt32LE(cursor + 42);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff || diskStart === 0xffff || version >= 45) invalid("ZIP64 or an unsupported ZIP version.");
    if (diskStart !== 0) invalid("multi-disk archives are not supported.");
    if (flags & (0x0001 | 0x0040 | 0x2000)) invalid("encrypted archives are not supported.");
    if (flags & ~(0x0006 | 0x0008 | 0x0800)) invalid("unsupported ZIP flags.");
    if (method !== 0 && method !== 8) invalid(`compression method ${method} is not supported.`);
    if (method === 0 && (flags & 0x0006)) invalid("unsupported stored-file flags.");
    if (size > MAX_ENTRY_BYTES || (total += size) > MAX_TOTAL_BYTES) invalid("decompressed size limit exceeded.");
    bounds(cursor + 46, nameLength + extraLength + commentLength, end);
    const nameBytes = data.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = utf8(nameBytes); const path = safePath(name);
    validateExtras(data.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength), nameBytes);
    if (paths.has(path.key)) invalid("duplicate member path.");
    paths.set(path.key, path.directory); entries.push(name);
    const unixType = (attrs >>> 16) & 0xf000;
    if (unixType && unixType !== 0x8000 && unixType !== 0x4000) invalid("special files and symbolic links are not supported.");
    if (((unixType === 0x4000 || (attrs & 0x10) !== 0) && !path.directory) ||
        (path.directory && (size !== 0 || unixType === 0x8000))) invalid("invalid directory entry.");

    bounds(localOffset, 30, centralStart);
    if (data.readUInt32LE(localOffset) !== LOCAL) invalid("invalid local header.");
    const localVersion = data.readUInt16LE(localOffset + 4); const localFlags = data.readUInt16LE(localOffset + 6);
    const localMethod = data.readUInt16LE(localOffset + 8); const localCrc = data.readUInt32LE(localOffset + 14);
    const localCompressed = data.readUInt32LE(localOffset + 18); const localSize = data.readUInt32LE(localOffset + 22);
    const localNameLength = data.readUInt16LE(localOffset + 26); const localExtraLength = data.readUInt16LE(localOffset + 28);
    if (localVersion !== version || localFlags !== flags || localMethod !== method) invalid("local and central headers differ.");
    if (flags & 8) {
      if ((localCrc !== 0 && localCrc !== checksum) || (localCompressed !== 0 && localCompressed !== compressedSize) || (localSize !== 0 && localSize !== size)) invalid("local and central sizes differ.");
    } else if (localCrc !== checksum || localCompressed !== compressedSize || localSize !== size) invalid("local and central sizes or CRC differ.");
    bounds(localOffset + 30, localNameLength + localExtraLength, centralStart);
    const localName = data.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (!localName.equals(nameBytes)) invalid("local and central names differ.");
    validateExtras(data.subarray(localOffset + 30 + localNameLength, localOffset + 30 + localNameLength + localExtraLength), nameBytes);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    bounds(start, compressedSize, centralStart);
    const compressed = data.subarray(start, start + compressedSize); let content: Buffer;
    if (method === 0) {
      if (compressedSize !== size) invalid("stored member size mismatch.");
      content = compressed;
    } else {
      try {
        // Node returns { buffer, engine } for info:true; @types/node declares only Buffer.
        const result = inflateRawSync(compressed, { maxOutputLength: Math.max(1, size), info: true }) as unknown as
          { buffer: Buffer; engine: { bytesWritten: number } };
        if (result.engine.bytesWritten !== compressedSize) invalid("deflate member has trailing data.");
        content = result.buffer;
      } catch (error) {
        if (error instanceof CommunityError) throw error;
        return invalid("corrupt or oversized deflate member.");
      }
    }
    if (content.length !== size || crc32(content) !== checksum) invalid("member size or CRC mismatch.");
    let recordEnd = start + compressedSize;
    if (flags & 8) {
      // The descriptor signature is optional; a CRC can itself equal the signature.
      const matches = (at: number) => at + 12 <= centralStart && data.readUInt32LE(at) === checksum &&
        data.readUInt32LE(at + 4) === compressedSize && data.readUInt32LE(at + 8) === size;
      if (recordEnd + 16 <= centralStart && data.readUInt32LE(recordEnd) === DESCRIPTOR && matches(recordEnd + 4)) recordEnd += 16;
      else if (matches(recordEnd)) recordEnd += 12;
      else invalid("invalid data descriptor.");
    }
    ranges.push({ start: localOffset, end: recordEnd });
    if (!path.directory && name.split("/").at(-1) === "SKILL.md") {
      if (skillPath !== undefined) invalid("more than one SKILL.md.");
      skillPath = name; skillContent = utf8(content);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end) invalid("central directory entry count mismatch.");
  for (const [path] of paths) {
    const components = path.split("/");
    while (components.length > 1) {
      components.pop();
      if (paths.get(components.join("/")) === false) invalid("file conflicts with a member directory.");
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let nextOffset = 0;
  for (const range of ranges) {
    if (range.start !== nextOffset) invalid("overlapping or unlisted local data.");
    nextOffset = range.end;
  }
  if (nextOffset !== centralStart) invalid("unlisted local data before the central directory.");
  if (skillPath === undefined || skillContent === undefined) invalid("exactly one SKILL.md is required.");
  if (!skillContent.trim()) invalid("SKILL.md must not be empty.");
  return { skill_path: skillPath, skill_content: skillContent, entries };
}
