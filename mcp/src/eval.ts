import type { SearchHit } from "./types.js";

export type EvalCase = {
  id: string;
  question: string;
  query: string;
  manual?: string;
  urlMustInclude: string[];
  pageMustInclude: string[];
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

export function pickRelevantHit(hits: SearchHit[], urlMustInclude: string[]): SearchHit | undefined {
  return hits.find((hit) => urlMustInclude.some((needle) => hit.url.includes(needle) || hit.title.includes(needle)));
}

export function scoreCase(
  evalCase: EvalCase,
  hits: SearchHit[],
  pageMarkdown?: string,
): CaseScore {
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
