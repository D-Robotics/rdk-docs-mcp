import { htmlToMarkdown } from "./fetch-page.js";
import type { HttpGet } from "./http.js";
import { rankHits } from "./search.js";
import type { IndexedDoc, SearchHit } from "./types.js";

export const FORUM_ORIGIN = "https://forum.d-robotics.cc";
export const FORUM_ID = "forum";
export const FORUM_ALIASES = ["forum", "社区", "论坛", "discourse"];

type DiscourseTopic = {
  id?: number;
  title?: string;
  slug?: string;
  tags?: string[];
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
    description: "官方社区问答与经验贴，补充手册未覆盖的实操问题。",
    homeUrl: `${FORUM_ORIGIN}/`,
    searchable: true,
    aliases: FORUM_ALIASES.filter((alias) => alias !== FORUM_ID),
  };
}

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

export async function searchForum(
  query: string,
  http: HttpGet,
  limit: number,
): Promise<SearchHit[]> {
  const url = `${FORUM_ORIGIN}/search.json?q=${encodeURIComponent(query)}`;
  const docs = compactDiscourseSearch(JSON.parse(await http(url)));
  return rankHits(docs, query, limit).map((hit) => ({ ...hit, source: "forum" as const }));
}

export async function getForumTopic(
  url: string,
  http: HttpGet,
): Promise<{ title: string; url: string; markdown: string }> {
  const jsonUrl = forumTopicJsonUrl(url);
  if (!jsonUrl) {
    throw new Error(`Not a forum topic URL: ${url}`);
  }
  return topicToMarkdown(JSON.parse(await http(jsonUrl)), url);
}
