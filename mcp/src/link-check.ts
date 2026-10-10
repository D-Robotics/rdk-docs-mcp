import type { IndexedDoc } from "./types.js";

const USER_AGENT = "rdk-docs-mcp/0.2 (+https://developer.d-robotics.cc/rdk_doc_center/)";
const TIMEOUT_MS = 12_000;
const DEAD_STATUS = new Set([404, 410]);

/** Page identity: no hash, no query, no trailing slash. */
export function pageUrl(url: string): string {
  const noHash = url.split("#")[0] ?? url;
  const noQuery = noHash.split("?")[0] ?? noHash;
  return noQuery.replace(/\/+$/, "");
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
    if (!DEAD_STATUS.has(first)) {
      if (first !== 200) unchecked.push(url);
      return;
    }
    const second = await probe(url);
    if (DEAD_STATUS.has(second)) dead.push(url);
    else unchecked.push(url);
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
