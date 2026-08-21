import { listManuals, origin, resolveManual, type Manual } from "./catalog.js";
import { compactDocusaurusIndex } from "./docusaurus.js";
import { htmlToMarkdown, resolveDocUrl } from "./fetch-page.js";
import { FORUM_ID, getForumTopic, isForumRef, listForumTopics, searchForum } from "./forum.js";
import type { HttpGet } from "./http.js";
import { findRspressPage, isRspressShell, loadRspressDocs, normalizeDocPath } from "./rspress.js";
import { rankHits } from "./search.js";
import { compactSphinxIndex } from "./sphinx.js";
import type { IndexedDoc, SearchHit } from "./types.js";

export type SearchSource = "docs" | "forum" | "all";

export type SearchInput = {
  query: string;
  manual?: string;
  source?: SearchSource;
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

function resolveSource(manual?: string, source?: SearchSource): SearchSource {
  if (source === "docs" || source === "forum" || source === "all") return source;
  if (manual && isForumRef(manual)) return "forum";
  if (manual) return "docs";
  return "all";
}

function mergeHits(docs: SearchHit[], forum: SearchHit[], limit: number): SearchHit[] {
  const picked: SearchHit[] = [];
  const seen = new Set<string>();
  const take = (hits: SearchHit[], cap: number) => {
    for (const hit of hits) {
      if (picked.length >= cap) break;
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      picked.push(hit);
    }
  };

  if (docs.length === 0) {
    take(forum, limit);
    return picked;
  }

  const forumCap =
    forum.length === 0 ? 0 : Math.min(forum.length, Math.max(1, Math.floor(limit * 0.25)));
  take(docs, limit - forumCap);
  take(forum, picked.length + forumCap);
  take(docs, limit);
  return picked;
}

function manualsForSearch(manual?: string): { targets: Manual[]; warnings: string[] } {
  if (manual && isForumRef(manual)) {
    return { targets: [], warnings: [] };
  }
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
  if (!target.searchable) {
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
  if (manual.indexKind === "rspress") {
    return loadRspressDocs(manual, http);
  }
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
  const source = resolveSource(input.manual, input.source);
  const includeDocs = source === "docs" || source === "all";
  const includeForum = source === "forum" || source === "all";
  const warnings: string[] = [];

  let docHits: SearchHit[] = [];
  if (includeDocs) {
    const { targets, warnings: catalogWarnings } = manualsForSearch(input.manual);
    warnings.push(...catalogWarnings);
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
    warnings.push(...loaded.map((item) => item.warning).filter((item): item is string => Boolean(item)));
    docHits = rankHits(
      loaded.flatMap((item) => item.docs),
      query,
      limit,
    ).map((hit) => ({ ...hit, source: "docs" as const }));
  }

  let forumHits: SearchHit[] = [];
  if (includeForum) {
    try {
      forumHits = await searchForum(query, http, limit);
    } catch (error) {
      warnings.push(`Failed to search forum: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    hits: mergeHits(docHits, forumHits, limit),
    warnings,
  };
}

export async function listToc(
  input: TocInput,
  http: HttpGet,
): Promise<{ manual: string; pages: Array<{ title: string; url: string; breadcrumbs?: string[] }> }> {
  if (isForumRef(input.manual)) {
    return {
      manual: FORUM_ID,
      pages: await listForumTopics(http, input.query),
    };
  }
  const manual = requireManual(input.manual);
  if (!manual.searchable) {
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
  if (new URL(url).hostname === "forum.d-robotics.cc") {
    const page = await getForumTopic(url, http);
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
  const html = await http(url);
  let page = htmlToMarkdown(html, url);
  if (isRspressShell(html, page.markdown)) {
    const fromIndex = await rspressPageFromIndex(url, http);
    if (fromIndex) page = fromIndex;
  }
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

async function rspressPageFromIndex(
  url: string,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string } | undefined> {
  const path = normalizeDocPath(url);
  const manual = listManuals().find(
    (item) => item.indexKind === "rspress" && path.startsWith(normalizeDocPath(`${origin()}${item.basePath}`)),
  );
  if (!manual) return undefined;

  try {
    const docs = await loadIndex(manual, http);
    const match = findRspressPage(docs, url);
    if (match?.text) {
      const markdown = match.text.startsWith("#") ? match.text : `# ${match.title}\n\n${match.text}`;
      return { title: match.title, url: match.url, markdown };
    }

    const homePath = normalizeDocPath(manual.homeUrl);
    const enHome = `${normalizeDocPath(`${origin()}${manual.basePath}`)}/en`;
    if (path === homePath || path === enHome || path === normalizeDocPath(`${origin()}${manual.basePath}`)) {
      const pages = docs.filter((doc) => doc.kind === "page").slice(0, 80);
      const markdown = [
        `# ${manual.title}`,
        "",
        ...pages.map((doc) => `- [${doc.title}](${doc.url})`),
      ].join("\n");
      return { title: manual.title, url: manual.homeUrl, markdown };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
