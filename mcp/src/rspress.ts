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

function versionParts(version: string): number[] | undefined {
  const cleaned = version.trim().replace(/^v/i, "");
  if (!/^\d+(?:\.\d+)*$/.test(cleaned)) return undefined;
  return cleaned.split(".").map((part) => Number(part));
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Keep every language of the newest numbered version when all versions are
 * numbered. Named or unversioned groups cannot be ordered reliably against
 * numbered versions, so keep all candidates when they occur together.
 */
export function currentRspressGroups(groups: RspressIndexGroup[]): RspressIndexGroup[] {
  const versions = new Set(groups.map((group) => group.version));
  if (versions.size <= 1) return groups;
  const numbered = [...versions].filter((version) => versionParts(version));
  if (numbered.length !== versions.size) return groups;
  const newest = numbered.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best));
  return groups.filter((group) => group.version === newest);
}

export function searchIndexFilename(group: RspressIndexGroup): string {
  // Rspress v1 replaces the first dot only (v1.0.5 -> v1_0.5).
  const version = group.version ? `.${group.version.replace(".", "_")}` : "";
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

  const discovered: Array<{ group: RspressIndexGroup; indexUrl: string }> = [];
  for (const bundleUrl of bundles) {
    const js = await http(bundleUrl);
    for (const group of parseRspressIndexGroups(js)) {
      // A retired manual URL can redirect to a new site prefix. Use the
      // discovered app bundle's location, rather than the catalog's old path.
      const indexUrl = new URL(`../${searchIndexFilename(group)}`, bundleUrl).href;
      discovered.push({ group, indexUrl });
    }
  }
  const current = new Set(
    currentRspressGroups(discovered.map((item) => item.group)).map(
      (group) => `${group.version}\0${group.lang}\0${group.hash}`,
    ),
  );
  const seen = new Set<string>();
  const indexUrls: string[] = [];
  for (const item of discovered) {
    const key = `${item.group.version}\0${item.group.lang}\0${item.group.hash}`;
    if (!current.has(key) || seen.has(item.indexUrl)) continue;
    seen.add(item.indexUrl);
    indexUrls.push(item.indexUrl);
  }
  if (indexUrls.length === 0) {
    throw new Error(`No search_index hashes in Rspress bundles for ${manual.id}`);
  }

  const loaded = await Promise.all(
    indexUrls.map(async (url) => {
      const raw: unknown = JSON.parse(await http(url));
      return compactRspressIndex(raw, manual.id);
    }),
  );
  return dedupeLanguageCopies(loaded.flat());
}

/**
 * Drop an `/en/` page when the same path exists without `/en/`.
 * English-only pages stay. Headings follow their page.
 */
export function dedupeLanguageCopies(docs: IndexedDoc[]): IndexedDoc[] {
  const keyOf = (url: string) => normalizeDocPath((url.split("#")[0] ?? url).replace(/\/en(?=\/|$)/gi, ""));
  const defaults = new Set<string>();
  for (const doc of docs) {
    if (doc.kind !== "page" || /\/en\//i.test(doc.url)) continue;
    defaults.add(keyOf(doc.url));
  }
  return docs.filter((doc) => !/\/en\//i.test(doc.url) || !defaults.has(keyOf(doc.url)));
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
