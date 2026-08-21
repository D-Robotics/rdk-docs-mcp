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

export function compactDocusaurusIndex(raw: unknown, manualId: string): IndexedDoc[] {
  if (!Array.isArray(raw)) return [];

  const docs: IndexedDoc[] = [];
  (raw as Shard[]).forEach((shard, shardIndex) => {
    for (const item of shard.documents ?? []) {
      if (!item.u) continue;
      const title = (item.s || item.t || "").trim();
      if (!title) continue;

      const kind: IndexedDoc["kind"] =
        shardIndex === 0 && !item.h ? "page" : item.h ? "heading" : "snippet";

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
  return docs;
}

export function pagesFromDocusaurusIndex(raw: unknown, manualId: string): IndexedDoc[] {
  return compactDocusaurusIndex(raw, manualId).filter((doc) => doc.kind === "page");
}
