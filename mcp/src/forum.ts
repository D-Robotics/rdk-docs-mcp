import { htmlToMarkdown } from "./fetch-page.js";
import type { HttpGet } from "./http.js";
import { rankHits } from "./search.js";
import type { IndexedDoc, SearchHit } from "./types.js";

export const FORUM_ORIGIN = "https://forum.d-robotics.cc";
export const FORUM_ID = "forum";
export const FORUM_ALIASES = ["forum", "社区", "论坛", "discourse"];

export const FORUM_BOARDS = [
  { id: 39, slug: "kai-fa-yu-wen-ti", name: "开发与问题" },
  { id: 4, slug: "general", name: "通用" },
] as const;

type DiscourseTopic = {
  id?: number;
  title?: string;
  slug?: string;
  tags?: string[];
  pinned?: boolean;
  excerpt?: string;
};

type DiscoursePostHit = {
  topic_id?: number;
  username?: string;
  blurb?: string;
};

type DiscourseSearch = {
  topics?: DiscourseTopic[];
  posts?: DiscoursePostHit[];
};

type DiscourseCookedPost = {
  post_number?: number;
  username?: string;
  cooked?: string;
};

type DiscourseTopicPage = {
  id?: number;
  title?: string;
  slug?: string;
  tags?: string[];
  post_stream?: { posts?: DiscourseCookedPost[] };
};

export function isForumRef(idOrAlias: string): boolean {
  return FORUM_ALIASES.includes(idOrAlias.trim().toLowerCase());
}

export function forumListing() {
  return {
    id: FORUM_ID,
    title: "地瓜机器人社区论坛",
    category: "社区",
    description: "社区经验补充，不是官方规范。手册未覆盖时再查；list_toc 列出「开发与问题」和「通用」最近帖。",
    homeUrl: `${FORUM_ORIGIN}/`,
    searchable: true,
    indexKind: "discourse" as const,
    aliases: FORUM_ALIASES.filter((alias) => alias !== FORUM_ID),
    note: "forum 不是手册 search-index，没有未知索引。MCP 已走 Discourse JSON。不要暂停这个入口，不要自己请求论坛 HTML 或 /search.json。",
  };
}

const FORUM_CATEGORY_NAMES: Record<number, string> = {
  4: "通用",
  7: "应用开发",
  12: "硬件开发",
  15: "Model Zoo",
  21: "反馈建议",
  39: "开发与问题",
  40: "项目与案例",
};

export function parseForumTopicId(urlOrPath: string): number | undefined {
  try {
    const path = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
    const match = path.match(/\/t(?:\/[^/]+)?\/(\d+)(?:\/\d+)?\/?$/);
    if (match?.[1]) return Number(match[1]);
    const bare = path.match(/^\/t\/(\d+)\/?$/);
    if (bare?.[1]) return Number(bare[1]);
  } catch {
    return undefined;
  }
  return undefined;
}

export function forumTopicJsonUrl(urlOrPath: string): string | undefined {
  const id = parseForumTopicId(urlOrPath);
  if (!id) return undefined;
  return `${FORUM_ORIGIN}/t/${id}.json`;
}

export function forumTopicUrl(topic: { id: number; slug?: string }): string {
  const slug = topic.slug?.trim() || "topic";
  return `${FORUM_ORIGIN}/t/${slug}/${topic.id}`;
}

export function boardLatestUrl(board: { id: number; slug?: string }): string {
  if (board.slug) return `${FORUM_ORIGIN}/c/${board.slug}/${board.id}/l/latest.json`;
  return `${FORUM_ORIGIN}/c/${board.id}/l/latest.json`;
}

export function parseForumCategoryId(urlOrPath: string): number | undefined {
  try {
    const path = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "c") return undefined;
    for (const part of [...parts.slice(1)].reverse()) {
      if (part === "l" || part === "latest" || part.endsWith(".json")) continue;
      if (/^\d+$/.test(part)) return Number(part);
      const tagged = part.match(/(\d+)$/);
      if (tagged?.[1]) return Number(tagged[1]);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function isForumHome(urlOrPath: string): boolean {
  try {
    const path = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
    return path === "/" || path === "";
  } catch {
    return false;
  }
}

export function forumCategoryName(id: number): string {
  return FORUM_CATEGORY_NAMES[id] ?? `板块 ${id}`;
}

export function categoryListToMarkdown(
  raw: unknown,
  url: string,
  boardName: string,
): { title: string; url: string; markdown: string } {
  const docs = compactDiscourseTopicList(raw, boardName);
  const lines = [`# ${boardName}`, "", `来源：${url}`, ""];
  for (const doc of docs) {
    lines.push(`- [${doc.title}](${doc.url})`);
  }
  if (docs.length === 0) {
    lines.push("这个板块暂时没有公开帖子。");
  }
  return { title: boardName, url, markdown: lines.join("\n").trim() };
}

function isBoardIntro(title: string, pinned?: boolean): boolean {
  return Boolean(pinned && /类别|欢迎来到|category/i.test(title));
}

export function compactDiscourseTopicList(raw: unknown, boardName: string): IndexedDoc[] {
  if (!raw || typeof raw !== "object") return [];
  const topics = (raw as { topic_list?: { topics?: DiscourseTopic[] } }).topic_list?.topics;
  if (!Array.isArray(topics)) return [];

  const docs: IndexedDoc[] = [];
  for (const topic of topics) {
    const title = topic.title?.trim();
    if (!topic.id || !title) continue;
    if (isBoardIntro(title, topic.pinned)) continue;
    const excerpt = String(topic.excerpt ?? "").replace(/<[^>]+>/g, "").trim();
    docs.push({
      manualId: FORUM_ID,
      title,
      url: forumTopicUrl({ id: topic.id, slug: topic.slug }),
      snippet: excerpt || undefined,
      text: excerpt || undefined,
      breadcrumbs: [boardName, ...(topic.tags ?? []).filter(Boolean)],
      kind: "page",
    });
  }
  return docs;
}

export function compactDiscourseSearch(raw: unknown): IndexedDoc[] {
  if (!raw || typeof raw !== "object") return [];
  const data = raw as DiscourseSearch;
  const blurbs = new Map<number, string>();
  for (const post of data.posts ?? []) {
    if (!post.topic_id || !post.blurb || blurbs.has(post.topic_id)) continue;
    blurbs.set(post.topic_id, post.blurb.trim());
  }

  const docs: IndexedDoc[] = [];
  for (const topic of data.topics ?? []) {
    if (!topic.id || !topic.title?.trim()) continue;
    const snippet = blurbs.get(topic.id);
    docs.push({
      manualId: FORUM_ID,
      title: topic.title.trim(),
      url: forumTopicUrl({ id: topic.id, slug: topic.slug }),
      snippet,
      text: snippet,
      breadcrumbs: topic.tags?.filter(Boolean),
      kind: "page",
    });
  }
  return docs;
}

export function topicToMarkdown(
  raw: unknown,
  url: string,
): { title: string; url: string; markdown: string } {
  const topic = raw as DiscourseTopicPage;
  const title = topic.title?.trim() || url;
  const canonical = topic.id ? forumTopicUrl({ id: topic.id, slug: topic.slug }) : url;
  const tags = (topic.tags ?? []).filter(Boolean);
  const posts = topic.post_stream?.posts ?? [];

  const parts = [`# ${title}`, ""];
  if (tags.length > 0) parts.push(`标签：${tags.join("、")}`, "");

  for (const post of posts) {
    const who = post.username ? `@${post.username}` : "回复";
    parts.push(`## ${who}`, "");
    const cooked = post.cooked?.trim() ?? "";
    if (cooked) {
      const converted = htmlToMarkdown(`<article>${cooked}</article>`, canonical);
      parts.push(converted.markdown.trim(), "");
    }
  }

  return { title, url: canonical, markdown: parts.join("\n").trim() };
}

export function forumHitsFromDocs(
  docs: IndexedDoc[],
  query: string,
  limit: number,
  fillFrom: IndexedDoc[] = [],
): SearchHit[] {
  const ranked = rankHits(docs, query, limit).map((hit) => ({ ...hit, source: "forum" as const }));
  if (ranked.length >= limit) return ranked;

  const seen = new Set(ranked.map((hit) => hit.url));
  const filled = [...ranked];
  for (const doc of fillFrom) {
    if (filled.length >= limit) break;
    if (seen.has(doc.url)) continue;
    seen.add(doc.url);
    filled.push({
      title: doc.title,
      url: doc.url,
      manual: FORUM_ID,
      snippet: doc.snippet ?? doc.breadcrumbs?.join(" / ") ?? "",
      score: Math.max(1, 6 - filled.length),
      source: "forum",
    });
  }
  return filled;
}

function parseJson(body: string): unknown | undefined {
  if (!body.trim()) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

export async function searchForum(
  query: string,
  http: HttpGet,
  limit: number,
): Promise<SearchHit[]> {
  const searchUrl = `${FORUM_ORIGIN}/search.json?q=${encodeURIComponent(query)}`;
  const bodies = await Promise.all([
    http(searchUrl).catch(() => ""),
    ...FORUM_BOARDS.map((board) => http(boardLatestUrl(board)).catch(() => "")),
  ]);

  const docs: IndexedDoc[] = [];
  const seen = new Set<string>();
  const add = (items: IndexedDoc[]) => {
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      docs.push(item);
    }
  };

  const searchRaw = parseJson(bodies[0] ?? "");
  const searchDocs = searchRaw ? compactDiscourseSearch(searchRaw) : [];
  add(searchDocs);
  FORUM_BOARDS.forEach((board, index) => {
    const raw = parseJson(bodies[index + 1] ?? "");
    if (raw) add(compactDiscourseTopicList(raw, board.name));
  });

  const fillFrom = /论坛|社区|经验|帖子|开发者/.test(query) ? docs : searchDocs;
  return forumHitsFromDocs(docs, query, limit, fillFrom);
}

export async function listForumTopics(
  http: HttpGet,
  query?: string,
): Promise<Array<{ title: string; url: string; breadcrumbs?: string[] }>> {
  const loaded = await Promise.all(
    FORUM_BOARDS.map(async (board) => {
      try {
        const raw = parseJson(await http(boardLatestUrl(board)));
        return raw ? compactDiscourseTopicList(raw, board.name) : [];
      } catch {
        return [];
      }
    }),
  );
  let pages = loaded.flat();
  if (query?.trim()) {
    const needle = query.trim().toLowerCase();
    pages = pages.filter(
      (page) =>
        page.title.toLowerCase().includes(needle) ||
        (page.snippet ?? "").toLowerCase().includes(needle) ||
        (page.breadcrumbs ?? []).some((crumb) => crumb.toLowerCase().includes(needle)),
    );
  }
  return pages.map((page) => ({
    title: page.title,
    url: page.url,
    breadcrumbs: page.breadcrumbs,
  }));
}

export async function getForumTopic(
  url: string,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string }> {
  return getForumPage(url, http);
}

export async function getForumPage(
  url: string,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string }> {
  const topicJson = forumTopicJsonUrl(url);
  if (topicJson) {
    return topicToMarkdown(JSON.parse(await http(topicJson)), url);
  }

  if (isForumHome(url)) {
    const pages = await listForumTopics(http);
    const lines = ["# 地瓜机器人社区论坛", "", "手册为主。以下是「开发与问题」和「通用」最近帖，仅作补充。", ""];
    for (const page of pages) {
      const board = page.breadcrumbs?.[0] ?? "论坛";
      lines.push(`- [${page.title}](${page.url})（${board}）`);
    }
    return { title: "地瓜机器人社区论坛", url: `${FORUM_ORIGIN}/`, markdown: lines.join("\n").trim() };
  }

  const categoryId = parseForumCategoryId(url);
  if (categoryId) {
    const name = forumCategoryName(categoryId);
    const raw = JSON.parse(await http(boardLatestUrl({ id: categoryId })));
    return categoryListToMarkdown(raw, url, name);
  }

  throw new Error(`Not a forum topic or category URL: ${url}`);
}
