import { htmlToMarkdown, isDocusaurusShell } from "./fetch-page.js";
import type { HttpGet } from "./http.js";
import { pageUrl } from "./link-check.js";
import type { IndexedDoc } from "./types.js";

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  } catch {
    return url.split("/").filter(Boolean);
  }
}

/** One path contains the other with only extra directories inserted. */
function sameEndpoint(left: string, right: string): boolean {
  const a = pathSegments(left);
  const b = pathSegments(right);
  if (a.length === 0 || b.length === 0) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length === longer.length) return shorter.join("/") === longer.join("/");
  let index = 0;
  for (const segment of longer) {
    if (segment === shorter[index]) index += 1;
    if (index === shorter.length) return true;
  }
  return false;
}

/**
 * Drop a longer copy of a page when another page has the same text and the
 * same ending path. Pages whose text differs stay, even if the paths nest.
 */
export function dedupeMirrorPages(docs: IndexedDoc[]): IndexedDoc[] {
  const groups = new Map<string, IndexedDoc[]>();
  for (const doc of docs) {
    if (doc.kind !== "page") continue;
    const text = (doc.text ?? "").trim();
    if (text.length < 8) continue;
    const list = groups.get(text) ?? [];
    list.push(doc);
    groups.set(text, list);
  }
  const drop = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((a, b) => pathSegments(a.url).length - pathSegments(b.url).length || a.url.length - b.url.length);
    const keep = ranked[0];
    if (!keep) continue;
    for (const extra of ranked.slice(1)) {
      if (!sameEndpoint(keep.url, extra.url)) continue;
      drop.add(pageUrl(extra.url));
    }
  }
  if (drop.size === 0) return docs;
  return docs.filter((doc) => !drop.has(pageUrl(doc.url)));
}

/** Prefer the https URL with a trailing slash. The no-slash form redirects to http and stalls. */
export function preferredPageUrls(url: string): string[] {
  const https = url.replace(/^http:\/\//i, "https://");
  const bare = (https.split("#")[0] ?? https).split("?")[0] ?? https;
  const slashed = bare.endsWith("/") ? bare : `${bare}/`;
  return [slashed];
}

async function liveMarkdown(url: string, http: HttpGet): Promise<string> {
  for (const candidate of preferredPageUrls(url)) {
    try {
      const html = await http(candidate);
      const page = htmlToMarkdown(html, candidate);
      if (!page.markdown.trim() || isDocusaurusShell(html, page.markdown)) continue;
      return page.markdown;
    } catch {
      continue;
    }
  }
  return "";
}

/** Replace a page body when the live page has more text than the search index. */
export async function fillPageBodies(docs: IndexedDoc[], http: HttpGet, concurrency = 6): Promise<IndexedDoc[]> {
  const pages = docs.filter((doc) => doc.kind === "page");
  const updates = new Map<string, string>();
  let index = 0;
  async function worker(): Promise<void> {
    while (index < pages.length) {
      const page = pages[index];
      index += 1;
      if (!page) continue;
      const markdown = await liveMarkdown(page.url, http);
      if (markdown.length > (page.text?.length ?? 0)) updates.set(page.url, markdown);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
  if (updates.size === 0) return docs;
  return docs.map((doc) => {
    const text = doc.kind === "page" ? updates.get(doc.url) : undefined;
    return text ? { ...doc, text } : doc;
  });
}
