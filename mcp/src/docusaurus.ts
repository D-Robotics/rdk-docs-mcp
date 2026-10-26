import { origin } from "./catalog.js";
import type { IndexedDoc } from "./types.js";

type RawDoc = {
  t?: string;
  u?: string;
  b?: string[];
  h?: string;
  s?: string;
  p?: number;
};

type Shard = {
  documents?: RawDoc[];
};

function toAbsoluteUrl(path: string, hash?: string): string {
  const base = path.startsWith("http") ? path : `${origin()}${path}`;
  if (!hash) return base;
  const normalized = hash.startsWith("#") ? hash : `#${hash}`;
  return `${base}${normalized}`;
}

function dehashedUrl(url: string): string {
  const hash = url.indexOf("#");
  return hash === -1 ? url : url.slice(0, hash);
}

export function titleFromDoc(item: { t?: string; s?: string; b?: string[]; u: string }): string {
  const titled = (item.s || item.t || "").trim();
  if (titled) return titled;
  const crumb = item.b?.filter(Boolean).at(-1)?.trim();
  if (crumb) return crumb;
  return item.u.split("/").filter(Boolean).at(-1) || item.u;
}

function appendAnswer(doc: IndexedDoc, chunk: string): void {
  const text = doc.answer ?? "";
  if (!chunk || text.includes(chunk)) return;
  doc.answer = text ? `${text}\n${chunk}` : chunk;
}

export function compactDocusaurusIndex(raw: unknown, manualId: string): IndexedDoc[] {
  if (!Array.isArray(raw)) return [];

  const docs: IndexedDoc[] = [];
  const headings = new Map<string, IndexedDoc>();
  (raw as Shard[]).forEach((shard, shardIndex) => {
    for (const item of shard.documents ?? []) {
      if (!item.u) continue;
      const title = titleFromDoc({ t: item.t, s: item.s, b: item.b, u: item.u });

      const kind: IndexedDoc["kind"] =
        shardIndex === 0 && !item.h ? "page" : item.h ? "heading" : "snippet";

      if (kind === "heading" && item.h) {
        const section = item.s?.trim() ?? "";
        const body = item.t?.trim() ?? "";
        const key = `${dehashedUrl(toAbsoluteUrl(item.u))}#${item.h}`;
        let doc = headings.get(key);
        if (!doc) {
          doc = {
            manualId,
            title: section || body || title,
            url: toAbsoluteUrl(item.u, item.h),
            breadcrumbs: item.b,
            kind: "heading",
          };
          headings.set(key, doc);
          docs.push(doc);
        } else if (section && section.length >= doc.title.length) {
          doc.title = section;
          if (!doc.breadcrumbs?.length && item.b?.length) doc.breadcrumbs = item.b;
        }
        // Shard headings store the question in `s` and the answer paragraphs in `t`.
        // Keep the answer off the heading body so title matches stay ahead of it.
        if (section && body && body !== section) appendAnswer(doc, body);
        continue;
      }

      docs.push({
        manualId,
        title: kind === "snippet" ? (item.s || item.t || title) : title,
        url: toAbsoluteUrl(item.u, item.h),
        snippet: kind === "snippet" ? item.t : undefined,
        breadcrumbs: item.b,
        kind,
      });
    }
  });

  const pagesByUrl = new Map<string, IndexedDoc>();
  for (const doc of docs) {
    if (doc.kind === "page") pagesByUrl.set(dehashedUrl(doc.url), doc);
  }

  const snippetChunks = new Map<string, string[]>();
  for (const doc of docs) {
    if (doc.kind !== "snippet") continue;
    const chunk = doc.snippet?.trim();
    if (!chunk) continue;
    const key = dehashedUrl(doc.url);
    const list = snippetChunks.get(key);
    if (list) list.push(chunk);
    else snippetChunks.set(key, [chunk]);
  }

  for (const [url, page] of pagesByUrl) {
    const chunks = snippetChunks.get(url);
    if (!chunks?.length) continue;
    page.text = [page.text, ...chunks].filter(Boolean).join("\n");
  }

  for (const doc of docs) {
    if (doc.kind !== "heading" || doc.snippet?.trim() || doc.text?.trim() || doc.answer?.trim()) continue;
    const page = pagesByUrl.get(dehashedUrl(doc.url));
    const fromCrumbs = doc.breadcrumbs?.filter(Boolean).join(" / ");
    const filled = page?.title?.trim() || fromCrumbs?.trim();
    if (filled) doc.snippet = filled;
  }

  return docs;
}

export function pagesFromDocusaurusIndex(raw: unknown, manualId: string): IndexedDoc[] {
  return compactDocusaurusIndex(raw, manualId).filter((doc) => doc.kind === "page");
}
