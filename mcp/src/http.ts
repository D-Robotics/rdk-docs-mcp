import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type HttpGet = (url: string) => Promise<string>;

const TIMEOUT_MS = 15_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "rdk-docs-mcp/0.1 (+https://developer.d-robotics.cc/rdk_doc_center/)";
const CACHE_VERSION = 1;

type CacheEnvelope = {
  version: typeof CACHE_VERSION;
  url: string;
  fetchedAt: number;
  body: string;
};

export function cacheTtlMs(): number {
  const raw = process.env.RDK_DOCS_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TTL_MS;
  return parsed;
}

function ttlFor(url: string): number {
  const configured = cacheTtlMs();
  if (configured === 0) return 0;
  if (url.includes("/search.json") || url.includes("/l/latest.json")) {
    return Math.min(configured, 15 * 60 * 1000);
  }
  if (url.includes("forum.d-robotics.cc")) return Math.min(configured, 60 * 60 * 1000);
  return configured;
}

export function cacheDir(): string {
  return process.env.RDK_DOCS_CACHE_DIR ?? join(homedir(), ".cache", "rdk-docs-mcp");
}

function cachePathFor(url: string): string {
  const key = createHash("sha256").update(url).digest("hex");
  return join(cacheDir(), `${key}.json`);
}

export const fetchText: HttpGet = async (url: string) => {
  const cached = await readCache(url);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,*/*" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const text = await response.text();
    try {
      await writeCache(url, text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`rdk-docs-mcp cache write skipped: ${message}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
};

async function readCache(url: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await readFile(cachePathFor(url), "utf8")) as unknown;
    const envelope = validateEnvelope(value, url);
    const ttl = ttlFor(url);
    if (ttl === 0 || Date.now() - envelope.fetchedAt > ttl) return undefined;
    return envelope.body;
  } catch {
    return undefined;
  }
}

async function writeCache(url: string, text: string): Promise<void> {
  const path = cachePathFor(url);
  await mkdir(dirname(path), { recursive: true });
  const envelope: CacheEnvelope = { version: CACHE_VERSION, url, fetchedAt: Date.now(), body: text };
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function validateEnvelope(value: unknown, url: string): CacheEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("cache envelope must be an object");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = ["body", "fetchedAt", "url", "version"];
  const actualKeys = Object.keys(record).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("cache envelope has unexpected fields");
  }
  if (
    record.version !== CACHE_VERSION ||
    record.url !== url ||
    typeof record.fetchedAt !== "number" ||
    !Number.isFinite(record.fetchedAt) ||
    record.fetchedAt < 0 ||
    record.fetchedAt > Date.now() ||
    typeof record.body !== "string"
  ) {
    throw new Error("cache envelope is invalid");
  }
  return record as CacheEnvelope;
}
