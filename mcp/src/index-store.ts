import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { HttpGet } from "./http.js";
import { fetchText } from "./http.js";
import type { IndexedDoc } from "./types.js";

const memory = new WeakMap<HttpGet, Map<string, IndexedDoc[]>>();
const notes: string[] = [];

/** Packaged snapshots older than this are refreshed from the live index when the network is available. */
export const PREBUILT_MAX_AGE_DAYS = 14;
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

export function prebuiltMaxAgeDays(): number {
  const raw = process.env.RDK_DOCS_PREBUILT_MAX_AGE_DAYS;
  if (raw === undefined || raw === "") return PREBUILT_MAX_AGE_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return PREBUILT_MAX_AGE_DAYS;
  return parsed;
}

export function prebuiltAgeDays(builtAt: string | undefined, now = Date.now()): number | undefined {
  if (!builtAt) return undefined;
  const parsed = Date.parse(builtAt);
  if (!Number.isFinite(parsed)) return undefined;
  return (now - parsed) / DAY_MS;
}

/** Missing or unparseable timestamps are stale so an undated snapshot cannot hide drift. */
export function prebuiltIsStale(builtAt: string | undefined, now = Date.now()): boolean {
  const age = prebuiltAgeDays(builtAt, now);
  if (age === undefined) return true;
  return age > prebuiltMaxAgeDays();
}

export function staleIndexWarning(manualId: string, builtAt: string | undefined, used: "live" | "snapshot"): string {
  const age = prebuiltAgeDays(builtAt);
  const ageText = age === undefined ? "an unknown age" : `${Math.floor(age)} days old`;
  if (used === "live") {
    return `Prebuilt index for ${manualId} is ${ageText} (older than ${prebuiltMaxAgeDays()} days). Used the live index. Refresh with npm run build:index.`;
  }
  return `Prebuilt index for ${manualId} is ${ageText} (older than ${prebuiltMaxAgeDays()} days) and the live index could not be loaded. Results may be stale. Refresh with npm run build:index.`;
}

export function noteIndex(message: string): void {
  notes.push(message);
}

export function drainIndexNotes(): string[] {
  return notes.splice(0, notes.length);
}

export function recallIndex(http: HttpGet, manualId: string): IndexedDoc[] | undefined {
  return memory.get(http)?.get(manualId);
}

export function rememberIndex(http: HttpGet, manualId: string, docs: IndexedDoc[]): void {
  let bucket = memory.get(http);
  if (!bucket) {
    bucket = new Map();
    memory.set(http, bucket);
  }
  bucket.set(manualId, docs);
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
