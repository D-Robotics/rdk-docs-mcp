import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { assertDocusaurusIndex } from "./docusaurus.js";

export type HttpGet = (url: string) => Promise<string>;

const TIMEOUT_MS = 15_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
export const STUDIO_CACHE_WINDOW_MS = 15 * 60 * 1000;
export type HttpTextResponse = { text: string; fetchedAt: number };

export function studioCacheTtlMs(): number {
  return Math.min(cacheTtlMs(), STUDIO_CACHE_WINDOW_MS);
}

function isStudioPage(url: string): boolean {
  const parsed = new URL(url);
  return parsed.hostname === "developer.d-robotics.cc" && parsed.pathname.startsWith("/rdk_studio_doc/");
}

function validateStudioIndex(url: string, text: string): void {
  if (isStudioPage(url) && new URL(url).pathname === "/rdk_studio_doc/search-index.json") {
    assertDocusaurusIndex(JSON.parse(text));
  }
}

const USER_AGENT = "rdk-docs-mcp/0.1 (+https://developer.d-robotics.cc/rdk_doc_center/)";

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
  if (isStudioPage(url)) return studioCacheTtlMs();
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
  const safe = url.replace(/[^\w.-]+/g, "_").slice(0, 180);
  return join(cacheDir(), `${safe}.txt`);
}

export const fetchText: HttpGet = async (url) => (await fetchTextResponse(url)).text;

/** Keep the origin fetch timestamp when a caller needs an end-to-end freshness bound. */
export async function fetchTextResponse(url: string): Promise<HttpTextResponse> {
  if (process.env.RDK_DOCS_OFFLINE === "1") {
    throw new Error(`RDK_DOCS_OFFLINE: refused network fetch ${url}`);
  }
  const cached = await readCachedText(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json,*/*" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const text = await response.text();
    validateStudioIndex(url, text);
    const fetchedAt = Date.now();
    await writeCache(url, text, fetchedAt);
    return { text, fetchedAt };
  } finally {
    clearTimeout(timer);
  }
}

/** Stale reads are only used by the Studio fallback path and still validate its index. */
export async function readCachedText(url: string, allowStale = false): Promise<HttpTextResponse | undefined> {
  try {
    const path = cachePathFor(url);
    const meta = JSON.parse(await readFile(`${path}.meta`, "utf8")) as { fetchedAt: number };
    if (!Number.isFinite(meta.fetchedAt) || meta.fetchedAt > Date.now()) return undefined;
    const ttl = ttlFor(url);
    if (!allowStale && (ttl === 0 || Date.now() - meta.fetchedAt >= ttl)) return undefined;
    const text = await readFile(path, "utf8");
    validateStudioIndex(url, text);
    return { text, fetchedAt: meta.fetchedAt };
  } catch {
    return undefined;
  }
}

async function writeCache(url: string, text: string, fetchedAt: number): Promise<void> {
  const path = cachePathFor(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  await writeFile(`${path}.meta`, JSON.stringify({ fetchedAt, url }), "utf8");
}
