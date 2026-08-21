import { origin, type Manual } from "./catalog.js";
import type { HttpGet } from "./http.js";
import type { IndexedDoc } from "./types.js";

export type RspressIndexGroup = {
  version: string;
  lang: string;
  hash: string;
};

type RspressTocItem = {
  text?: string;
  id?: string;
};

type RspressPage = {
  title?: string;
  content?: string;
  routePath?: string;
  lang?: string;
  toc?: RspressTocItem[];
};

const GROUP_RE = /"([^"]*###[^"]+)":"([a-f0-9]{6,16})"/g;
const SCRIPT_SRC_RE = /<script[^>]+src="([^"]+)"/gi;

export function parseRspressIndexGroups(js: string): RspressIndexGroup[] {
  const groups: RspressIndexGroup[] = [];
  for (const match of js.matchAll(GROUP_RE)) {
    const [version = "", lang = ""] = match[1]?.split("###") ?? [];
    const hash = match[2];
    if (!hash) continue;
    groups.push({ version, lang, hash });
  }
  return groups;
}

export function searchIndexFilename(group: RspressIndexGroup): string {
  const version = group.version ? `.${group.version.replaceAll(".", "_")}` : "";
  const lang = group.lang ? `.${group.lang}` : "";
  return `search_index${version}${lang}.${group.hash}.json`;
}

export function rspressAppBundleUrls(html: string, siteOrigin: string): string[] {
  const srcs = [...html.matchAll(SCRIPT_SRC_RE)].map((match) => match[1] ?? "");
  return srcs
    .filter((src) => /\/static\/js\//.test(src) && !/\/lib-/.test(src) && !/\/styles\./.test(src))
    .map((src) => resolveSiteUrl(src, siteOrigin));
}

export function normalizeDocPath(urlOrPath: string): string {
  let path = urlOrPath.trim();
  try {
    path = new URL(path).pathname;
  } catch {
    if (!path.startsWith("/")) path = `/${path}`;
  }
  return path.replace(/\/index\.html$/i, "").replace(/\.html$/i, "").replace(/\/+$/, "") || "/";
}

export function isRspressShell(html: string, markdown: string): boolean {
  const rspress = /content="Rspress/i.test(html) || html.includes("__rspress_root");
  const compact = markdown.replace(/\s+/g, " ").trim();
  return rspress && compact.length < 200;
}

export function compactRspressIndex(raw: unknown, manualId: string): IndexedDoc[] {
  if (!Array.isArray(raw)) return [];

  const docs: IndexedDoc[] = [];
  for (const item of raw as RspressPage[]) {
    const title = item.title?.trim();
    const routePath = item.routePath?.trim();
    if (!title || !routePath) continue;

    const url = resolveSiteUrl(routePath, origin());
    const content = item.content?.trim() ?? "";
    docs.push({
      manualId,
      title,
      url,
      snippet: excerpt(content),
      text: content,
      breadcrumbs: item.lang ? [item.lang] : undefined,
      kind: "page",
    });

    for (const heading of item.toc ?? []) {
      const headingTitle = heading.text?.trim();
      if (!headingTitle) continue;
      const hash = heading.id ? `#${heading.id}` : "";
      docs.push({
        manualId,
        title: headingTitle,
        url: `${url}${hash}`,
        snippet: headingTitle,
        breadcrumbs: item.lang ? [item.lang, title] : [title],
        kind: "heading",
      });
    }
  }
  return docs;
}

export function findRspressPage(docs: IndexedDoc[], url: string): IndexedDoc | undefined {
  const target = normalizeDocPath(url);
  return docs.find((doc) => doc.kind === "page" && normalizeDocPath(doc.url) === target);
}

export async function loadRspressDocs(manual: Manual, http: HttpGet): Promise<IndexedDoc[]> {
  const home = await http(manual.homeUrl);
  const bundles = rspressAppBundleUrls(home, origin());
  if (bundles.length === 0) {
    throw new Error(`No Rspress app bundles at ${manual.homeUrl}`);
  }

  const seen = new Set<string>();
  const groups: RspressIndexGroup[] = [];
  for (const bundleUrl of bundles) {
    const js = await http(bundleUrl);
    for (const group of parseRspressIndexGroups(js)) {
      const name = searchIndexFilename(group);
      if (seen.has(name)) continue;
      seen.add(name);
      groups.push(group);
    }
  }
  if (groups.length === 0) {
    throw new Error(`No search_index hashes in Rspress bundles for ${manual.id}`);
  }

  const loaded = await Promise.all(
    groups.map(async (group) => {
      const url = `${origin()}${manual.basePath}/static/${searchIndexFilename(group)}`;
      const raw: unknown = JSON.parse(await http(url));
      return compactRspressIndex(raw, manual.id);
    }),
  );
  return loaded.flat();
}

function resolveSiteUrl(path: string, siteOrigin: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${siteOrigin}${path.startsWith("/") ? path : `/${path}`}`;
}

function excerpt(text: string): string {
  const compact = text.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
  if (compact.length <= 280) return compact;
  return `${compact.slice(0, 280)}…`;
}
