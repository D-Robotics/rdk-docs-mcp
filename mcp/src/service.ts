import { docInManual, listManuals, origin, resolveManual, type Manual } from "./catalog.js";
import { mentionedBoards, urlLooksLikeBoard, type BoardId } from "./products.js";
import { compactDocusaurusIndex } from "./docusaurus.js";
import { dedupeMirrorPages, fillPageBodies } from "./mirror-pages.js";
import { canonicalizeDocUrl } from "./doc-urls.js";
import { htmlToMarkdown, isDocusaurusShell, resolveDocUrl } from "./fetch-page.js";
import { FORUM_ID, getForumTopic, isForumRef, listForumTopics, searchForum } from "./forum.js";
import { fetchText, type HttpGet } from "./http.js";
import { findRspressPage, isRspressShell, loadRspressDocs, normalizeDocPath } from "./rspress.js";
import { contextBoards, manualMatchesBoards, markPackagedIndex, primeIndex } from "./bm25.js";
import { searchGuidance } from "./routes.js";
import { groupHits, matchQuality, searchManuals } from "./search.js";
import { selectSection } from "./sections.js";
import { compactSphinxIndex } from "./sphinx.js";
import {
  drainIndexNotes,
  noteIndex,
  prebuiltEnabled,
  prebuiltIsStale,
  readPrebuiltSnapshot,
  recallIndex,
  rememberIndex,
  staleIndexWarning,
} from "./index-store.js";
import type { BoardGroup, IndexedDoc, SearchHit } from "./types.js";

export type SearchSource = "docs" | "forum" | "all";

export type SearchInput = {
  query: string;
  manual?: string;
  source?: SearchSource;
  limit?: number;
  /** Board the agent is on. Used when the query itself does not name one. */
  board?: BoardId;
};

export type TocInput = {
  manual: string;
  query?: string;
};

export type PageInput = {
  url: string;
  maxChars?: number;
  /** Heading text to return instead of the start of the page. */
  section?: string;
  /** Find the section that answers this query, even when it sits past maxChars. */
  query?: string;
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
  const cached = recallIndex(http, manual.id);
  if (cached) return cached;
  if (prebuiltEnabled(http)) {
    const snapshot = readPrebuiltSnapshot(manual.id);
    if (snapshot && !prebuiltIsStale(snapshot.builtAt)) {
      markPackagedIndex(snapshot.docs);
      rememberIndex(http, manual.id, snapshot.docs);
      return snapshot.docs;
    }
    if (snapshot && prebuiltIsStale(snapshot.builtAt)) {
      if (manual.expandBodies) {
        // Page text was filled at build time. Fetching it again walks every
        // page and adds seconds to the first query.
        markPackagedIndex(snapshot.docs);
        rememberIndex(http, manual.id, snapshot.docs);
        noteIndex(
          `Prebuilt index for ${manual.id} is stale. Keeping the packaged page text; live page bodies are fetched only while building the snapshot.`,
        );
        return snapshot.docs;
      }
      try {
        const live = await loadIndexFromOrigin(manual, http);
        rememberIndex(http, manual.id, live);
        noteIndex(staleIndexWarning(manual.id, snapshot.builtAt, "live"));
        return live;
      } catch (error) {
        markPackagedIndex(snapshot.docs);
        rememberIndex(http, manual.id, snapshot.docs);
        noteIndex(staleIndexWarning(manual.id, snapshot.builtAt, "snapshot"));
        const message = error instanceof Error ? error.message : String(error);
        noteIndex(`Live index for ${manual.id} failed: ${message}`);
        return snapshot.docs;
      }
    }
  }
  const docs = await loadIndexFromOrigin(manual, http);
  rememberIndex(http, manual.id, docs);
  return docs;
}

export async function loadIndexFromOrigin(
  manual: Manual,
  http: HttpGet,
  opts?: { fillBodies?: boolean },
): Promise<IndexedDoc[]> {
  if (manual.indexKind === "rspress") {
    return loadRspressDocs(manual, http);
  }
  if (!manual.indexPath) return [];
  const url = `${origin()}${manual.indexPath}`;
  const body = await http(url);
  if (manual.indexKind === "docusaurus") {
    const docs = compactDocusaurusIndex(JSON.parse(body), manual.id).filter((doc) => docInManual(manual, doc.url));
    if (!manual.expandBodies) return docs;
    const deduped = dedupeMirrorPages(docs);
    if (!opts?.fillBodies) return deduped;
    return fillPageBodies(deduped, http);
  }
  if (manual.indexKind === "sphinx") {
    return compactSphinxIndex(body, manual.id, manual.basePath);
  }
  return [];
}

let indexWarm: Promise<void> | undefined;

/** Load packaged manuals and their posting tables before the first query. */
export function warmSearchIndex(http: HttpGet = fetchText): Promise<void> {
  if (!indexWarm) indexWarm = warmSearchIndexNow(http);
  return indexWarm;
}

async function warmSearchIndexNow(http: HttpGet): Promise<void> {
  const manuals = listManuals().filter((manual) => manual.searchable);
  await Promise.all(
    manuals.map(async (manual) => {
      try {
        const docs = await loadIndex(manual, http);
        primeIndex(docs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        noteIndex(`Warm index for ${manual.id} failed: ${message}`);
      }
    }),
  );
}

export async function searchDocs(
  input: SearchInput,
  http: HttpGet,
): Promise<{
  hits: SearchHit[];
  groups: BoardGroup[];
  ambiguousBoard: boolean;
  warnings: string[];
  guidance: string;
  noGoodMatch: boolean;
  matchQuality: "good" | "weak" | "none";
  confidence: number;
}> {
  const query = input.query.trim();
  if (!query) {
    throw new Error("query is required");
  }
  if (indexWarm) await indexWarm;
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const source = resolveSource(input.manual, input.source);
  const includeDocs = source === "docs" || source === "all";
  const includeForum = source === "forum" || source === "all";
  const warnings: string[] = [];
  const mentioned = mentionedBoards(query);
  const needsBoard = /升级|烧录|镜像|驱动|安装|系统|GPIO|PoE|WiFi|摄像头/i.test(query);
  if (needsBoard && mentioned.length === 0 && !input.manual && !input.board)
    warnings.push("Board model is missing; version- or hardware-specific instructions require clarification before execution.");
  if (mentioned.length > 1 && input.manual === "rdk-x")
    warnings.push("Comparison evidence must be checked per board; do not infer a missing model's facts from another model.");

  let docHits: SearchHit[] = [];
  let searched: IndexedDoc[][] = [];
  if (includeDocs) {
    const { targets, warnings: catalogWarnings } = manualsForSearch(input.manual, query);
    warnings.push(...catalogWarnings);
    const boards = contextBoards(query, { board: input.board });
    const filtered = targets.filter((manual) => manualMatchesBoards(manual.id, boards));
    const loaded = await Promise.all(
      filtered.map(async (manual) => {
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
    warnings.push(...drainIndexNotes());
    searched = loaded.map((item) => item.docs);
    docHits = searchManuals(searched, query, limit, { board: input.board }).map((hit) => ({
      ...hit,
      source: "docs" as const,
    }));
  }

  let forumHits: SearchHit[] = [];
  if (includeForum) {
    try {
      forumHits = await searchForum(query, http, limit);
    } catch (error) {
      warnings.push(`Failed to search forum: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (mentioned.length > 1 && docHits.length > 0) {
    const missing = mentioned.filter((board) => !docHits.some((hit) => urlLooksLikeBoard(hit.url, board) || urlLooksLikeBoard(hit.title, board)));
    if (missing.length > 0)
      warnings.push(`No retrieved hit is explicitly scoped to: ${missing.join(", ")}. Treat the comparison as incomplete.`);
  }
  const hits = mergeHits(docHits, forumHits, limit).map((hit) =>
    hit.source === "forum" ? { ...hit, role: "forum-supplement" as const } : hit,
  );
  const groups = groupHits(hits);
  const boardGroups = groups.filter((group) => group.board !== "agnostic" && group.board !== "multiple");
  const ambiguousBoard = mentioned.length === 0 && !input.board && boardGroups.length > 1;
  const quality = matchQuality(hits, searched, query);
  if (quality.noGoodMatch) {
    warnings.push(
      "noGoodMatch: the query has no RDK-specific term in the searched manuals. Generic words such as install, login, or docker do not count. Do not invent an identifier.",
    );
  }
  if (ambiguousBoard) {
    warnings.push(
      "No board in the query. Hits are grouped by board. Pass board=x3|x5|s100|s600. Agents on a board, including Moss, should pass the detected board.",
    );
  }
  return {
    hits,
    groups,
    ambiguousBoard,
    warnings,
    guidance: quality.noGoodMatch
      ? "noGoodMatch: the query has no RDK-specific term in the searched manuals. Generic words such as install, login, or docker do not count. Read the snippets; if they do not answer, reformulate into a short query and pass board when you know it. Try 2 reformulations before concluding nothing is documented, or set source=forum."
      : `${searchGuidance()} Read the top snippets and decide whether they answer the question. noGoodMatch=false is not proof of relevance. confidence is advisory. Prefer a short query (error text, command, or a few keywords) and pass board when you know it. If the snippets do not answer, reformulate and search again; try 2 reformulations before concluding nothing is documented, or set source=forum.`,
    noGoodMatch: quality.noGoodMatch,
    matchQuality: quality.matchQuality,
    confidence: quality.confidence,
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
): Promise<{
  title: string;
  url: string;
  markdown: string;
  truncated: boolean;
  section?: string;
  anchor?: string;
  sectionMatched?: boolean;
  imageOnly?: boolean;
  contentNotes?: string[];
}> {
  const url = canonicalizeDocUrl(resolveDocUrl(input.url));
  if (new URL(url).hostname === "forum.d-robotics.cc") {
    return finishPage(await getForumTopic(url, http), input);
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
  return finishPage(page, input);
}

function finishPage(
  page: { title: string; url: string; markdown: string },
  input: PageInput,
): {
  title: string;
  url: string;
  markdown: string;
  truncated: boolean;
  section?: string;
  anchor?: string;
  sectionMatched?: boolean;
  imageOnly?: boolean;
  contentNotes?: string[];
} {
  let hash = "";
  try {
    hash = new URL(input.url, "https://developer.d-robotics.cc").hash.replace(/^#/, "");
  } catch {
    hash = "";
  }
  const picked = selectSection(page.markdown, {
    section: input.section,
    query: input.query,
    anchor: hash || undefined,
  });
  const maxChars = input.maxChars ?? 16_000;
  const truncated = picked.markdown.length > maxChars;
  const markdown = truncated ? `${picked.markdown.slice(0, maxChars)}\n\n…[truncated]` : picked.markdown;
  return {
    title: page.title,
    url: page.url,
    markdown,
    truncated,
    section: picked.section,
    anchor: picked.anchor,
    sectionMatched: picked.matched,
    imageOnly: picked.imageOnly,
    contentNotes: picked.contentNotes.length > 0 ? picked.contentNotes : undefined,
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
