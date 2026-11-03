import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type HttpGet = (url: string) => Promise<string>;

const TIMEOUT_MS = 15_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
/** 搜索索引是检索结果的唯一来源，用短 TTL 换分钟级新鲜度（过期后靠 ETag 复核，命中 304 不重下）。 */
export const INDEX_TTL_MS = 15 * 60 * 1000;
const USER_AGENT = "rdk-docs-mcp/0.1 (+https://developer.d-robotics.cc/rdk_doc_center/)";
const CACHE_VERSION = 2;

type CacheEnvelope = {
  version: typeof CACHE_VERSION;
  url: string;
  fetchedAt: number;
  body: string;
  etag?: string;
  lastModified?: string;
};

export function cacheTtlMs(): number {
  const raw = process.env.RDK_DOCS_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_TTL_MS;
  return parsed;
}

/** 各站点的搜索索引：Docusaurus `search-index.json`、Sphinx `searchindex.js`、Rspress `search_index.*.json`。 */
export function isIndexUrl(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return (
    /\/search-index\.json$/.test(path) ||
    /\/searchindex\.js$/.test(path) ||
    /\/search_index\.[^/]*\.json$/.test(path)
  );
}

function ttlFor(url: string): number {
  const configured = cacheTtlMs();
  if (configured === 0) return 0;
  if (isIndexUrl(url)) return Math.min(configured, INDEX_TTL_MS);
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
  if (process.env.RDK_DOCS_OFFLINE === "1") {
    throw new Error(`RDK_DOCS_OFFLINE: refused network fetch ${url}`);
  }
  const cached = await readCacheEntry(url);
  if (cached !== undefined && !isExpired(cached, url)) return cached.body;

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/json,*/*",
  };
  // 过期不等于重下：带上校验器，没变就是 304。
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (response.status === 304 && cached !== undefined) {
      await touchCache(url, cached);
      return cached.body;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const text = await response.text();
    try {
      await writeCache(url, text, response.headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`rdk-docs-mcp cache write skipped: ${message}`);
    }
    return text;
  } catch (error) {
    // Normal reads tolerate stale data; release verification can require a live response.
    if (cached !== undefined && process.env.RDK_DOCS_FAIL_ON_STALE !== "1") {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`rdk-docs-mcp: live fetch failed for ${url}; serving cached copy (${message})`);
      return cached.body;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

function isExpired(envelope: CacheEnvelope, url: string): boolean {
  const ttl = ttlFor(url);
  if (ttl === 0) return true;
  return Date.now() - envelope.fetchedAt > ttl;
}

async function readCacheEntry(url: string): Promise<CacheEnvelope | undefined> {
  try {
    const value = JSON.parse(await readFile(cachePathFor(url), "utf8")) as unknown;
    return validateEnvelope(value, url);
  } catch {
    return undefined;
  }
}

async function touchCache(url: string, envelope: CacheEnvelope): Promise<void> {
  try {
    await writeCache(url, envelope.body, undefined, envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`rdk-docs-mcp cache write skipped: ${message}`);
  }
}

async function writeCache(
  url: string,
  text: string,
  headers?: Headers,
  previous?: CacheEnvelope,
): Promise<void> {
  const path = cachePathFor(url);
  await mkdir(dirname(path), { recursive: true });
  const etag = headers?.get("etag") ?? previous?.etag;
  const lastModified = headers?.get("last-modified") ?? previous?.lastModified;
  const envelope: CacheEnvelope = { version: CACHE_VERSION, url, fetchedAt: Date.now(), body: text };
  if (etag) envelope.etag = etag;
  if (lastModified) envelope.lastModified = lastModified;
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
  for (const key of Object.keys(record)) {
    if (!["body", "etag", "fetchedAt", "lastModified", "url", "version"].includes(key)) {
      throw new Error("cache envelope has unexpected fields");
    }
  }
  for (const key of ["body", "url", "fetchedAt", "version"]) {
    if (!(key in record)) throw new Error("cache envelope is missing fields");
  }
  if (record.etag !== undefined && typeof record.etag !== "string") {
    throw new Error("cache envelope has an invalid etag");
  }
  if (record.lastModified !== undefined && typeof record.lastModified !== "string") {
    throw new Error("cache envelope has an invalid lastModified");
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
