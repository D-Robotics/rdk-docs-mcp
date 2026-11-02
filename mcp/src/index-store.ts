import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { HttpGet } from "./http.js";
import { INDEX_TTL_MS, cacheTtlMs, fetchText } from "./http.js";
import type { IndexedDoc } from "./types.js";

type MemoryEntry = { docs: IndexedDoc[]; fetchedAt: number };
const memory = new WeakMap<HttpGet, Map<string, MemoryEntry>>();
const notes: string[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrebuiltSnapshot = {
  builtAt?: string;
  manualId?: string;
  docs: IndexedDoc[];
};

export function prebuiltDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "prebuilt");
}

export function prebuiltEnabled(http: HttpGet): boolean {
  if (http !== fetchText) return false;
  return process.env.RDK_DOCS_PREBUILT !== "0";
}

export function prebuiltAgeDays(builtAt: string | undefined, now = Date.now()): number | undefined {
  if (!builtAt) return undefined;
  const parsed = Date.parse(builtAt);
  if (!Number.isFinite(parsed)) return undefined;
  return (now - parsed) / DAY_MS;
}

export function snapshotBuiltAtText(builtAt: string | undefined): string {
  const age = prebuiltAgeDays(builtAt);
  if (age === undefined) return "build time unknown";
  return `built ${Math.floor(age)} days ago`;
}

export function noteIndex(message: string): void {
  notes.push(message);
}

export function drainIndexNotes(): string[] {
  return notes.splice(0, notes.length);
}

/** 进程内缓存和磁盘缓存共用同一套时效，否则内存层会把 TTL 架空。 */
export function memoryTtlMs(): number {
  const configured = cacheTtlMs();
  if (configured === 0) return 0;
  return Math.min(configured, INDEX_TTL_MS);
}

export function recallIndex(http: HttpGet, manualId: string): IndexedDoc[] | undefined {
  const entry = memory.get(http)?.get(manualId);
  if (!entry) return undefined;
  const ttl = memoryTtlMs();
  if (ttl === 0 || Date.now() - entry.fetchedAt > ttl) {
    memory.get(http)?.delete(manualId);
    return undefined;
  }
  return entry.docs;
}

export function rememberIndex(http: HttpGet, manualId: string, docs: IndexedDoc[]): void {
  let bucket = memory.get(http);
  if (!bucket) {
    bucket = new Map();
    memory.set(http, bucket);
  }
  bucket.set(manualId, { docs, fetchedAt: Date.now() });
}

export function readPrebuiltSnapshot(manualId: string): PrebuiltSnapshot | undefined {
  const path = join(prebuiltDir(), `${manualId}.json.gz`);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as unknown;
    if (Array.isArray(parsed)) return { manualId, docs: parsed as IndexedDoc[] };
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { docs?: unknown }).docs)) return undefined;
    const body = parsed as { builtAt?: unknown; manualId?: unknown; docs: IndexedDoc[] };
    return {
      builtAt: typeof body.builtAt === "string" ? body.builtAt : undefined,
      manualId: typeof body.manualId === "string" ? body.manualId : manualId,
      docs: body.docs,
    };
  } catch {
    return undefined;
  }
}

export function readPrebuilt(manualId: string): IndexedDoc[] | undefined {
  return readPrebuiltSnapshot(manualId)?.docs;
}
