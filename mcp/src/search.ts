import type { IndexedDoc, SearchHit } from "./types.js";

function tokens(query: string): string[] {
  const parts = query
    .trim()
    .split(/\s+/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : [];
}

function haystack(doc: IndexedDoc): { title: string; extra: string } {
  return {
    title: doc.title.toLowerCase(),
    extra: [doc.snippet, ...(doc.breadcrumbs ?? [])].filter(Boolean).join(" ").toLowerCase(),
  };
}

function scoreDoc(doc: IndexedDoc, queryTokens: string[]): number {
  const { title, extra } = haystack(doc);
  let score = 0;
  for (const token of queryTokens) {
    if (title === token) score += 14;
    else if (title.includes(token)) score += 10;
    if (extra.includes(token)) score += 3;
    if (doc.kind === "page" && title.includes(token)) score += 2;
  }
  return score;
}

function canonicalUrl(url: string): string {
  return url.split("#")[0] ?? url;
}

export function rankHits(docs: IndexedDoc[], query: string, limit: number): SearchHit[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];

  const best = new Map<string, SearchHit>();
  for (const doc of docs) {
    const score = scoreDoc(doc, queryTokens);
    if (score <= 0) continue;
    const url = canonicalUrl(doc.url);
    const hit: SearchHit = {
      title: doc.kind === "snippet" && doc.snippet ? doc.title : doc.title,
      url,
      manual: doc.manualId,
      snippet: doc.snippet ?? doc.breadcrumbs?.join(" / ") ?? "",
      score,
    };
    const prev = best.get(url);
    if (!prev || hit.score > prev.score) {
      best.set(url, hit);
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
