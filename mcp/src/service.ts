import { listManuals, origin, resolveManual, type Manual } from "./catalog.js";
import { compactDocusaurusIndex } from "./docusaurus.js";
import { htmlToMarkdown, resolveDocUrl } from "./fetch-page.js";
import type { HttpGet } from "./http.js";
import { rankHits } from "./search.js";
import { compactSphinxIndex } from "./sphinx.js";
import type { IndexedDoc, SearchHit } from "./types.js";

export type SearchInput = {
  query: string;
  manual?: string;
  limit?: number;
};

export type TocInput = {
  manual: string;
  query?: string;
};

export type PageInput = {
  url: string;
  maxChars?: number;
};

function requireManual(idOrAlias: string): Manual {
  const manual = resolveManual(idOrAlias);
  if (!manual) {
    throw new Error(`Unknown manual: ${idOrAlias}. Call list_manuals to see valid ids.`);
  }
  return manual;
}

function manualsForSearch(manual?: string): { targets: Manual[]; warnings: string[] } {
  if (!manual) {
    const searchable = listManuals().filter((item) => item.searchable);
    const missing = listManuals().filter((item) => !item.searchable).map((item) => item.id);
    const warnings =
      missing.length > 0
        ? [`No public search index for: ${missing.join(", ")}. Use list_toc + get_page on their homeUrl.`]
        : [];
    return { targets: searchable, warnings };
  }
  const target = requireManual(manual);
  if (!target.searchable || !target.indexPath) {
    return {
      targets: [],
      warnings: [
        `${target.id} has no public search index. Open ${target.homeUrl} with get_page, or list_toc if a sidebar can be extracted later.`,
      ],
    };
  }
  return { targets: [target], warnings: [] };
}

async function loadIndex(manual: Manual, http: HttpGet): Promise<IndexedDoc[]> {
  if (!manual.indexPath) return [];
  const url = `${origin()}${manual.indexPath}`;
  const body = await http(url);
  if (manual.indexKind === "docusaurus") {
    return compactDocusaurusIndex(JSON.parse(body), manual.id);
  }
  if (manual.indexKind === "sphinx") {
    return compactSphinxIndex(body, manual.id, manual.basePath);
  }
  return [];
}

export async function searchDocs(
  input: SearchInput,
  http: HttpGet,
): Promise<{ hits: SearchHit[]; warnings: string[] }> {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query is required");
  }
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const { targets, warnings } = manualsForSearch(input.manual);
  const loaded = await Promise.all(
    targets.map(async (manual) => {
      try {
        return { docs: await loadIndex(manual, http), warning: undefined };
      } catch (error) {
        return {
          docs: [] as IndexedDoc[],
          warning: `Failed to load index for ${manual.id}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }),
  );

  return {
    hits: rankHits(
      loaded.flatMap((item) => item.docs),
      query,
      limit,
    ),
    warnings: [...warnings, ...loaded.map((item) => item.warning).filter((item): item is string => Boolean(item))],
  };
}

export async function listToc(
  input: TocInput,
  http: HttpGet,
): Promise<{ manual: string; pages: Array<{ title: string; url: string; breadcrumbs?: string[] }> }> {
  const manual = requireManual(input.manual);
  if (!manual.searchable || !manual.indexPath) {
    return {
      manual: manual.id,
      pages: [{ title: manual.title, url: manual.homeUrl }],
    };
  }

  const docs = await loadIndex(manual, http);
  const source = docs.filter((doc) => doc.kind === "page");
  const filtered = input.query
    ? source.filter((doc) => doc.title.toLowerCase().includes(input.query!.toLowerCase()))
    : source;

  return {
    manual: manual.id,
    pages: filtered.map((doc) => ({
      title: doc.title,
      url: doc.url.split("#")[0] ?? doc.url,
      breadcrumbs: doc.breadcrumbs,
    })),
  };
}

export async function getPage(
  input: PageInput,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string; truncated: boolean }> {
  const url = resolveDocUrl(input.url);
  const html = await http(url);
  const page = htmlToMarkdown(html, url);
  const maxChars = input.maxChars ?? 16_000;
  if (page.markdown.length <= maxChars) {
    return { ...page, truncated: false };
  }
  return {
    ...page,
    markdown: `${page.markdown.slice(0, maxChars)}\n\n…[truncated]`,
    truncated: true,
  };
}
