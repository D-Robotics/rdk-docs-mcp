import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type HttpGet = (url: string) => Promise<string>;

const TIMEOUT_MS = 15_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
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
    await writeCache(url, text);
    return text;
  } finally {
    clearTimeout(timer);
  }
};

async function readCache(url: string): Promise<string | undefined> {
  try {
    const path = cachePathFor(url);
    const metaPath = `${path}.meta`;
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { fetchedAt: number };
    const ttl = ttlFor(url);
    if (ttl === 0 || Date.now() - meta.fetchedAt > ttl) return undefined;
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function writeCache(url: string, text: string): Promise<void> {
  const path = cachePathFor(url);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
  await writeFile(`${path}.meta`, JSON.stringify({ fetchedAt: Date.now(), url }), "utf8");
}
