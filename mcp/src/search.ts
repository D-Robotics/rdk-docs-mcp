import { RETRIEVAL_ALIASES } from "./aliases.js";
import { absentCommandToken, contextBoards, rankCorpora, type RankOptions } from "./bm25.js";
import type { IndexedDoc, ResultBoard, SearchHit } from "./types.js";

export type { RankOptions };

function aliasNote(query: string, hit: SearchHit): SearchHit {
  const raw = query.trim().toLowerCase();
  const aliases = RETRIEVAL_ALIASES[raw];
  if (!aliases) return hit;
  const blob = `${hit.title} ${hit.url} ${hit.snippet}`.toLowerCase();
  if (blob.includes(raw)) return hit;
  const via = aliases.find((alias) => blob.includes(alias.toLowerCase()));
  if (!via) return hit;
  return {
    ...hit,
    matchedVia: "alias",
    snippet: `No indexed page contains \`${raw}\`. Closest documented page (${via}). ${hit.snippet}`.slice(0, 280),
  };
}

export function groupHits(hits: SearchHit[]): Array<{ board: ResultBoard; hits: SearchHit[] }> {
  const order: ResultBoard[] = [];
  const map = new Map<ResultBoard, SearchHit[]>();
  for (const hit of hits) {
    const board: ResultBoard = hit.board ?? "agnostic";
    const list = map.get(board);
    if (list) list.push(hit);
    else {
      map.set(board, [hit]);
      order.push(board);
    }
  }
  return order.map((board) => ({ board, hits: map.get(board) ?? [] }));
}

function diversifyByBoard(hits: SearchHit[]): SearchHit[] {
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const key = hit.board ?? "agnostic";
    const list = groups.get(key);
    if (list) list.push(hit);
    else groups.set(key, [hit]);
  }
  if (groups.size <= 1) return hits;
  const keys = [...groups.keys()].sort((a, b) => (groups.get(b)?.[0]?.score ?? 0) - (groups.get(a)?.[0]?.score ?? 0));
  const seen = new Set<SearchHit>();
  const first: SearchHit[] = [];
  for (const key of keys) {
    const hit = groups.get(key)?.[0];
    if (!hit) continue;
    first.push(hit);
    seen.add(hit);
  }
  return [...first, ...hits.filter((hit) => !seen.has(hit))];
}

function rollback(part: string): boolean {
  return (process.env.RDK_ABLATE ?? "")
    .split(",")
    .map((item) => item.trim())
    .includes(part);
}

function orderHits(docsGroups: IndexedDoc[][], query: string, limit: number, options: RankOptions): SearchHit[] {
  const ranked = rankCorpora(docsGroups, query, options);
  const unscoped = contextBoards(query, options).length === 0;
  // Unscoped hits follow score. Groups still cluster by board.
  // `RDK_ABLATE=no_diversify` means do not round-robin. It used to turn
  // round-robin on, which inverted the name. `RDK_ABLATE=diversify` restores it.
  const roundRobin = unscoped && rollback("diversify") && !rollback("no_diversify");
  const ordered = roundRobin ? diversifyByBoard(ranked) : ranked;
  return ordered.slice(0, limit).map((hit) => aliasNote(query, hit));
}

export function rankHits(docs: IndexedDoc[], query: string, limit: number, options: RankOptions = {}): SearchHit[] {
  return orderHits([docs], query, limit, options);
}

/** Score each manual's stable doc array on its own cached index, then merge. */
export function searchManuals(
  groups: IndexedDoc[][],
  query: string,
  limit: number,
  options: RankOptions = {},
): SearchHit[] {
  return orderHits(groups, query, limit, options);
}

const ALT_QUERY_LIMIT = 3;
const PAGE_RRF_K = 10;

/** Keep at most 3 non-empty alternates that differ from the original query. */
export function normalizeAltQueries(query: string, alts: string[] | undefined): string[] {
  const seen = new Set<string>([query.trim()]);
  const out: string[] = [];
  for (const alt of alts ?? []) {
    const text = alt.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length === ALT_QUERY_LIMIT) break;
  }
  return out;
}

function pageKey(url: string): string {
  return (url.split("#")[0] ?? url).replace(/\/+$/, "");
}

/**
 * Merge one ranked list per query by page. Each list has weight 1.
 * Rank is 0-based and the first time a page appears in that list.
 */
export function fusePageHits(lists: SearchHit[][], limit: number): SearchHit[] {
  const score = new Map<string, number>();
  const best = new Map<string, { hit: SearchHit; rank: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((hit, index) => {
      const key = pageKey(hit.url);
      if (seen.has(key)) return;
      seen.add(key);
      score.set(key, (score.get(key) ?? 0) + 1 / (PAGE_RRF_K + index));
      const prev = best.get(key);
      if (!prev || index < prev.rank) best.set(key, { hit, rank: index });
    });
  }
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .flatMap(([key, rrf]) => {
      const hit = best.get(key)?.hit;
      return hit ? [{ ...hit, score: rrf }] : [];
    });
}

export function matchQuality(
  hits: SearchHit[],
  groups: IndexedDoc[][] = [],
  query = "",
): {
  noGoodMatch: boolean;
  matchQuality: "good" | "weak" | "none";
  confidence: number;
} {
  const top = hits[0];
  const confidence = top?.confidence ?? 0;
  if (!top || top.score <= 0) {
    const missing = query ? absentCommandToken(groups, query) : false;
    return missing
      ? { noGoodMatch: true, matchQuality: "weak", confidence: 0 }
      : { noGoodMatch: false, matchQuality: "none", confidence: 0 };
  }
  if (top.quality === "weak") return { noGoodMatch: true, matchQuality: "weak", confidence };
  return { noGoodMatch: false, matchQuality: "good", confidence };
}
