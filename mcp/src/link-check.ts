import type { IndexedDoc } from "./types.js";

const USER_AGENT = "rdk-docs-mcp/0.2 (+https://developer.d-robotics.cc/rdk_doc_center/)";
const TIMEOUT_MS = 12_000;
const DEAD_STATUS = new Set([404, 410]);

/** Page identity: no hash, no query. The trailing slash is kept — `/cn` and `/cn/` are different URLs. */
export function pageUrl(url: string): string {
  const noHash = url.split("#")[0] ?? url;
  return noHash.split("?")[0] ?? noHash;
}

function slashVariant(url: string): string {
  return url.endsWith("/") ? url.replace(/\/+$/, "") : `${url}/`;
}

/**
 * Drop rate for the build. Pages the previous snapshot never contained are not a new loss:
 * a dead URL that was already left out must not block a refresh of the manuals we ship.
 * With no previous snapshot, every loaded page counts.
 */
export function linkCheckDropCounts(
  prior: ReadonlySet<string> | undefined,
  loaded: readonly string[],
  kept: readonly string[],
): { before: number; after: number } {
  const loadedPages = new Set(loaded.map(pageUrl));
  const keptPages = new Set(kept.map(pageUrl));
  if (!prior) return { before: loadedPages.size, after: keptPages.size };
  let before = 0;
  let after = 0;
  for (const url of prior) {
    const page = pageUrl(url);
    if (!loadedPages.has(page)) continue;
    before += 1;
    if (keptPages.has(page)) after += 1;
  }
  return { before, after };
}

/** True when more than 2% of the probed pages were removed. */
export function excessivePageDrop(before: number, after: number): boolean {
  if (before <= 0 || after >= before) return false;
  return (before - after) / before > 0.02;
}

export type ManualPageCounts = { manualId: string; before: number; after: number };

/** Per manual, not across the whole corpus. One small manual can fail on its own. */
export function formatManualDropError(rows: readonly ManualPageCounts[]): string | undefined {
  const bad = rows.filter((row) => excessivePageDrop(row.before, row.after));
  if (bad.length === 0) return undefined;
  const detail = bad
    .map((row) => {
      const dropped = row.before - row.after;
      return `${row.manualId}: ${dropped} of ${row.before} (${((dropped / row.before) * 100).toFixed(1)}%)`;
    })
    .join("; ");
  return `link check dropped more than 2% of pages in ${detail}`;
}

/** Node's fetch does not read HTTP(S)_PROXY or ALL_PROXY, so a proxy looks like a timeout. */
export function proxyFetchWarning(): string | undefined {
  const keys = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy"];
  if (!keys.some((key) => (process.env[key] ?? "").trim())) return undefined;
  return "warn\tNode fetch ignores HTTP(S)_PROXY and ALL_PROXY, so the link check can time out and skip pages when a proxy is required.";
}

export function pageUrlsOf(docs: IndexedDoc[]): string[] {
  return [...new Set(docs.map((doc) => pageUrl(doc.url)))];
}

/** Drop the page and every heading or snippet that lives on it. */
export function dropDocsForDeadPages(docs: IndexedDoc[], dead: ReadonlySet<string>): IndexedDoc[] {
  if (dead.size === 0) return docs;
  return docs.filter((doc) => !dead.has(pageUrl(doc.url)));
}

export type PageProbe = (url: string) => Promise<number>;

/** HTTP status, or 0 when the request failed. Does not follow the document cache. */
export async function probePageStatus(url: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pages whose status is 404 or 410 on two probes. A timeout or any other
 * status is left in `unchecked` and is not treated as dead.
 */
export async function findDeadPageUrls(
  urls: string[],
  probe: PageProbe = probePageStatus,
  concurrency = 24,
): Promise<{ dead: string[]; unchecked: string[] }> {
  const pending = [...new Set(urls.map(pageUrl))];
  const dead: string[] = [];
  const unchecked: string[] = [];
  let index = 0;

  async function classify(url: string): Promise<void> {
    const first = await probe(url);
    if (first === 200) return;
    const otherUrl = slashVariant(url);
    if (DEAD_STATUS.has(first)) {
      // `/cn` is 404 while `/cn/` is the live page. A slash-only difference is not a dead link.
      const other = otherUrl === url ? first : await probe(otherUrl);
      if (other === 200) return;
      const second = await probe(url);
      if (DEAD_STATUS.has(second) && DEAD_STATUS.has(other)) dead.push(url);
      else unchecked.push(url);
      return;
    }
    unchecked.push(url);
  }

  async function worker(): Promise<void> {
    while (index < pending.length) {
      const url = pending[index];
      index += 1;
      if (url) await classify(url);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
  dead.sort();
  unchecked.sort();
  return { dead, unchecked };
}
