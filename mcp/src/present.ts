import type { SearchHit } from "./types.js";

/** Default search_docs tool response: 5 hits, short snippets, about 2000 characters. */
export const COMPACT_HIT_LIMIT = 5;
export const COMPACT_SNIPPET_CHARS = 200;
export const COMPACT_RESULT_CHARS = 2_000;

const COMPACT_GUIDANCE =
  "Open at most 1–2 pages with get_page, using each hit's url and anchor. If the snippets do not answer, reformulate the query.";

export type CompactSearchInput = {
  hits: SearchHit[];
  ambiguousBoard: boolean;
  noGoodMatch: boolean;
  warnings: string[];
};

export type CompactHit = {
  title: string;
  url: string;
  anchor?: string;
  snippet: string;
};

export type CompactSearch = {
  hits: CompactHit[];
  ambiguousBoard: boolean;
  noGoodMatch: boolean;
  warnings: string[];
  guidance: string;
};

function anchorOf(url: string): string | undefined {
  const hash = url.split("#")[1];
  if (!hash) return undefined;
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function clipSnippet(snippet: string, max: number): string {
  const text = snippet.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function build(result: CompactSearchInput, snippetChars: number): CompactSearch {
  return {
    hits: result.hits.map((hit) => {
      const anchor = anchorOf(hit.url);
      return {
        title: hit.title,
        url: hit.url.split("#")[0] ?? hit.url,
        ...(anchor ? { anchor } : {}),
        snippet: clipSnippet(hit.snippet, snippetChars),
      };
    }),
    ambiguousBoard: result.ambiguousBoard,
    noGoodMatch: result.noGoodMatch,
    warnings: result.warnings,
    guidance: COMPACT_GUIDANCE,
  };
}

/**
 * Title, page URL, section anchor, and a short snippet.
 * When capChars is set, snippets shrink until the pretty-printed JSON fits.
 */
export function compactSearchResult(
  result: CompactSearchInput,
  opts: { snippetChars?: number; capChars?: number } = {},
): CompactSearch {
  const snippetChars = opts.snippetChars ?? COMPACT_SNIPPET_CHARS;
  const cap = opts.capChars;
  if (cap == null) return build(result, snippetChars);
  let width = snippetChars;
  let payload = build(result, width);
  while (width > 0 && JSON.stringify(payload, null, 2).length > cap) {
    width = Math.max(0, width - 20);
    payload = build(result, width);
  }
  return payload;
}
