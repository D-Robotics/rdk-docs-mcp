import type { SearchHit } from "./types.js";

export type EvalCase = {
  id: string;
  question: string;
  query: string;
  manual?: string;
  urlMustInclude: string[];
  pageMustInclude: string[];
  firstHitMustInclude?: string[];
};

export type CaseScore = {
  id: string;
  question: string;
  searchPass: boolean;
  pagePass: boolean;
  pass: boolean;
  hitUrl?: string;
  hitTitle?: string;
  reason: string;
};

export type ForumTocPage = { title: string; url: string; breadcrumbs?: string[] };

export function scoreForumToc(pages: ForumTocPage[]): { pass: boolean; reason: string; boards: string[] } {
  const boards = [...new Set(pages.flatMap((page) => (page.breadcrumbs?.[0] ? [page.breadcrumbs[0]] : [])))];
  if (pages.length < 10) {
    return { pass: false, reason: `too few topics: ${pages.length}`, boards };
  }
  if (!boards.includes("开发与问题") || !boards.includes("通用")) {
    return { pass: false, reason: `missing boards: ${boards.join(" + ") || "(none)"}`, boards };
  }
  const bad = pages.find((page) => !page.url.includes("forum.d-robotics.cc/t/"));
  if (bad) {
    return { pass: false, reason: `non-topic URL: ${bad.url}`, boards };
  }
  return { pass: true, reason: `${pages.length} topics from ${boards.join(" + ")}`, boards };
}

export function scoreDocsFirstMix(
  hits: SearchHit[],
  limit: number,
): { pass: boolean; reason: string } {
  if (hits.length === 0) {
    return { pass: false, reason: "mixed search returned no hits" };
  }
  const docs = hits.filter((hit) => hit.source === "docs");
  const forum = hits.filter((hit) => hit.source === "forum");
  const forumCap = Math.max(1, Math.floor(limit * 0.25));
  if (docs.length === 0) {
    return { pass: false, reason: "mixed search returned only forum hits" };
  }
  if (hits[0]?.source !== "docs") {
    return { pass: false, reason: `first hit was ${hits[0]?.source}: ${hits[0]?.title}` };
  }
  if (forum.length > forumCap) {
    return { pass: false, reason: `forum took ${forum.length} slots, cap is ${forumCap}` };
  }
  if (docs.length <= forum.length) {
    return { pass: false, reason: `docs ${docs.length} did not outnumber forum ${forum.length}` };
  }
  return { pass: true, reason: `docs ${docs.length} + forum ${forum.length}, docs first` };
}

export function pickRelevantHit(hits: SearchHit[], urlMustInclude: string[]): SearchHit | undefined {
  return hits.find((hit) => urlMustInclude.some((needle) => hit.url.includes(needle) || hit.title.includes(needle)));
}

function matchesNeedles(hit: SearchHit | undefined, needles: string[]): boolean {
  if (!hit) return false;
  return needles.some((needle) => hit.url.includes(needle) || hit.title.includes(needle));
}

export function scoreCase(
  evalCase: EvalCase,
  hits: SearchHit[],
  pageMarkdown?: string,
): CaseScore {
  if (evalCase.firstHitMustInclude?.length) {
    const first = hits[0];
    if (!matchesNeedles(first, evalCase.firstHitMustInclude)) {
      return {
        id: evalCase.id,
        question: evalCase.question,
        searchPass: false,
        pagePass: false,
        pass: false,
        hitUrl: first?.url,
        hitTitle: first?.title,
        reason: `first hit was ${first?.url ?? "(empty)"}, want ${evalCase.firstHitMustInclude.join(" | ")}`,
      };
    }
  }

  const hit = pickRelevantHit(hits, evalCase.urlMustInclude);
  const searchPass = Boolean(hit);
  const pagePass =
    !evalCase.pageMustInclude.length ||
    Boolean(
      pageMarkdown &&
        evalCase.pageMustInclude.some((needle) => pageMarkdown.toLowerCase().includes(needle.toLowerCase())),
    );

  if (!searchPass) {
    return {
      id: evalCase.id,
      question: evalCase.question,
      searchPass: false,
      pagePass: false,
      pass: false,
      reason: `top hits missed ${evalCase.urlMustInclude.join(" | ")}`,
    };
  }

  if (!pagePass) {
    return {
      id: evalCase.id,
      question: evalCase.question,
      searchPass: true,
      pagePass: false,
      pass: false,
      hitUrl: hit?.url,
      hitTitle: hit?.title,
      reason: `page missing ${evalCase.pageMustInclude.join(" | ")}`,
    };
  }

  return {
    id: evalCase.id,
    question: evalCase.question,
    searchPass: true,
    pagePass: true,
    pass: true,
    hitUrl: hit?.url,
    hitTitle: hit?.title,
    reason: "search + page can answer",
  };
}
