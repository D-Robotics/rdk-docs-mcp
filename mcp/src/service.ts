import { listManuals, origin, resolveManual, type Manual } from "./catalog.js";
import { compactDocusaurusIndex } from "./docusaurus.js";
import { canonicalizeDocUrl } from "./doc-urls.js";
import { htmlToMarkdown, isDocusaurusShell, resolveDocUrl } from "./fetch-page.js";
import { FORUM_ID, getForumTopic, isForumRef, listForumTopics, searchForum } from "./forum.js";
import type { HttpGet } from "./http.js";
import { findRspressPage, isRspressShell, loadRspressDocs, normalizeDocPath } from "./rspress.js";
import { applyOfficialPath, matchOfficialPath, searchGuidance } from "./routes.js";
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
  return "docs";
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

function extraManualsForQuery(manual: Manual, query: string): Manual[] {
  if (!/烧录|镜像|xburn/i.test(query)) return [];
  if (manual.id !== "rdk-s") return [];
  return ["xburn", "rdk-studio"]
    .map((id) => resolveManual(id))
    .filter((item): item is Manual => Boolean(item));
}

function manualsForSearch(manual?: string, query = ""): { targets: Manual[]; warnings: string[] } {
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
  const extras = extraManualsForQuery(target, query);
  return { targets: [target, ...extras], warnings: [] };
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
): Promise<{ hits: SearchHit[]; warnings: string[]; guidance: string }> {
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
    const { targets, warnings: catalogWarnings } = manualsForSearch(input.manual, query);
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

  const official = includeDocs ? matchOfficialPath(query, input.manual) : undefined;
  return {
    hits: applyOfficialPath(mergeHits(docHits, forumHits, limit), official, limit),
    warnings,
    guidance: searchGuidance(official),
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
  const url = canonicalizeDocUrl(resolveDocUrl(input.url));
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
  if (isDocusaurusShell(html, page.markdown)) {
    const fromIndex = await docusaurusPageFromIndex(url, http);
    page = fromIndex ?? {
      ...page,
      title: page.title || url,
      markdown: emptyShellNotice(url),
    };
  }
  if (!page.markdown.trim()) {
    page = {
      ...page,
      title: page.title || url,
      markdown: emptyShellNotice(url),
    };
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

function emptyShellNotice(url: string): string {
  return [
    `这是现网空壳页：${url}`,
    "",
    "现网该页没有正文。请改开 search_docs 返回的下一条 related 命中，或打开对应手册首页。",
  ].join("\n");
}

async function docusaurusPageFromIndex(
  url: string,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string } | undefined> {
  const path = normalizeDocPath(url);
  const manuals = listManuals().filter(
    (item) => item.indexKind === "docusaurus" && (item.id === "rdk-x" || item.id === "rdk-s"),
  );
  const matching = manuals.filter((item) =>
    path.startsWith(normalizeDocPath(`${origin()}${item.basePath}`)),
  );
  const targets = matching.length > 0 ? matching : manuals;

  for (const manual of targets) {
    try {
      const recovered = recoverDocusaurusMarkdown(await loadIndex(manual, http), path);
      if (recovered) {
        return { title: recovered.title, url, markdown: recovered.markdown };
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function recoverDocusaurusMarkdown(
  docs: IndexedDoc[],
  path: string,
): { title: string; markdown: string } | undefined {
  const matches = docs.filter((doc) => normalizeDocPath(doc.url) === path);
  if (matches.length === 0) return undefined;

  const pageDoc = matches.find((doc) => doc.kind === "page");
  const title = (pageDoc?.title || matches.find((doc) => doc.title)?.title || "").trim();
  const chunks: string[] = [];
  const seen = new Set<string>();
  const push = (value?: string) => {
    const text = value?.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    chunks.push(text);
  };

  if (pageDoc?.text?.trim()) {
    push(pageDoc.text);
  } else {
    for (const doc of matches) {
      push(doc.text);
      push(doc.snippet);
    }
  }
  if (chunks.length === 0) return undefined;

  const body = chunks.join("\n\n");
  const markdown = body.startsWith("#") ? body : `# ${title}\n\n${body}`;
  return {
    title: title || path.split("/").filter(Boolean).at(-1) || path,
    markdown,
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
