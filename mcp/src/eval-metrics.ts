/** Pure retrieval metrics. Live runs live in eval-retrieval.ts. */

export type RetrievalHit = {
  url: string;
  title?: string;
  score?: number;
};

export type RetrievalCase = {
  id: string;
  query: string;
  manual?: string;
  source?: "docs" | "forum" | "all";
  board?: "x3" | "x5" | "s100" | "s600";
  limit?: number;
  /** Relevant if the hit URL contains any of these substrings. */
  expectUrlIncludes?: string[];
  /** Every substring must show up somewhere in the top 3 URLs. */
  expectAllInTop3?: string[];
  /** A no-good-match signal is the correct outcome (identifier absent upstream). */
  expectNoGoodMatch?: boolean;
  note?: string;
};

export type PageCheck = {
  id: string;
  url: string;
  query?: string;
  section?: string;
  maxChars?: number;
  mustInclude: string[];
  expectImageOnly?: boolean;
  note?: string;
};

export function rankOf(hits: RetrievalHit[], needles: string[]): number | null {
  if (needles.length === 0) return null;
  const lowered = needles.map((needle) => needle.toLowerCase());
  const index = hits.findIndex((hit) => lowered.some((needle) => hit.url.toLowerCase().includes(needle)));
  return index === -1 ? null : index + 1;
}

export function coversAll(hits: RetrievalHit[], needles: string[], window = 3): boolean {
  const urls = hits.slice(0, window).map((hit) => hit.url.toLowerCase());
  return needles.every((needle) => urls.some((url) => url.includes(needle.toLowerCase())));
}

export type CaseMetric = {
  id: string;
  rank: number | null;
  hitAt1: boolean;
  hitAt3: boolean;
  reciprocalRank: number;
  allInTop3: boolean | null;
  noGoodMatch: boolean;
  topUrl?: string;
  topTitle?: string;
  ms: number;
};

export function scoreRetrievalCase(
  evalCase: RetrievalCase,
  hits: RetrievalHit[],
  noGoodMatch: boolean,
  ms: number,
): CaseMetric {
  if (evalCase.expectNoGoodMatch) {
    const ok = noGoodMatch === true;
    return {
      id: evalCase.id,
      rank: ok ? 1 : null,
      hitAt1: ok,
      hitAt3: ok,
      reciprocalRank: ok ? 1 : 0,
      allInTop3: null,
      noGoodMatch,
      topUrl: hits[0]?.url,
      topTitle: hits[0]?.title,
      ms,
    };
  }

  const needles = evalCase.expectUrlIncludes ?? [];
  const rank = rankOf(hits, needles);
  const allInTop3 = evalCase.expectAllInTop3 ? coversAll(hits, evalCase.expectAllInTop3) : null;
  return {
    id: evalCase.id,
    rank,
    hitAt1: rank === 1,
    hitAt3: rank !== null && rank <= 3,
    reciprocalRank: rank ? 1 / rank : 0,
    allInTop3,
    noGoodMatch,
    topUrl: hits[0]?.url,
    topTitle: hits[0]?.title,
    ms,
  };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(cases: CaseMetric[]): {
  n: number;
  hitAt1: number;
  hitAt3: number;
  mrr: number;
  meanMs: number;
  p95Ms: number;
} {
  const n = cases.length || 1;
  const hitAt1 = cases.filter((item) => item.hitAt1).length / n;
  const hitAt3 = cases.filter((item) => item.hitAt3).length / n;
  const mrr = cases.reduce((sum, item) => sum + item.reciprocalRank, 0) / n;
  const meanMs = cases.reduce((sum, item) => sum + item.ms, 0) / n;
  const p95Ms = percentile(cases.map((item) => item.ms), 95);
  return { n: cases.length, hitAt1, hitAt3, mrr, meanMs, p95Ms };
}
