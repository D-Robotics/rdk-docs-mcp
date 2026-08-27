import { GLOSSARY_ALIASES } from "./glossary-aliases.js";
import { soleBoard, urlLooksLikeBoard } from "./products.js";
import type { IndexedDoc, SearchHit } from "./types.js";

/** Question filler that carries no retrieval signal in Chinese queries. */
const CJK_STOPWORDS = [
  "怎么样",
  "怎么",
  "怎样",
  "如何",
  "什么",
  "哪些",
  "哪里",
  "是否",
  "多少",
  "请问",
  "帮我",
  "一下",
  "可不可以",
  "能不能",
  "有没有",
];

const CJK_STOP_CHARS = new Set(["的", "了", "吗", "呢", "啊", "吧", "把", "是", "有", "个", "和", "或", "在", "给", "去", "到", "太", "很"]);

const SYNONYMS: Record<string, string[]> = {
  flash: ["烧录", "burn"],
  burn: ["烧录"],
  wifi: ["wi-fi", "无线"],
  install: ["安装"],
};

/** 并集合并多份同义词表:key 冲突时数组取并集,而非后者覆盖前者。 */
function mergeSynonyms(...maps: Array<Record<string, string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const map of maps) {
    for (const [key, extras] of Object.entries(map)) {
      out[key] = [...new Set([...(out[key] ?? []), ...extras])];
    }
  }
  return out;
}

// 手写语义同义(SYNONYMS)+ glossary 派生的写法归范别名(GLOSSARY_ALIASES),单点并集合并。
const ALL_SYNONYMS = mergeSynonyms(SYNONYMS, GLOSSARY_ALIASES);

const CJK_RUN = /[\u4e00-\u9fff]+/g;

function cjkBigrams(query: string): string[] {
  const grams: string[] = [];
  for (const match of query.matchAll(CJK_RUN)) {
    let run = match[0];
    for (const stop of CJK_STOPWORDS) {
      run = run.replaceAll(stop, "\u0000");
    }
    run = [...run].map((ch) => (CJK_STOP_CHARS.has(ch) ? "\u0000" : ch)).join("");
    for (const segment of run.split("\u0000")) {
      if (segment.length < 2) continue;
      for (let i = 0; i + 2 <= segment.length; i += 1) {
        grams.push(segment.slice(i, i + 2));
      }
    }
  }
  return grams;
}

export function tokens(query: string): string[] {
  const seen = new Set<string>();
  const lowered = query.trim().toLowerCase();
  for (const match of lowered.matchAll(/[a-z][a-z0-9_.-]*|\d+/g)) {
    seen.add(match[0]);
  }
  for (const gram of cjkBigrams(lowered)) {
    seen.add(gram);
  }
  for (const [key, extras] of Object.entries(ALL_SYNONYMS)) {
    if (seen.has(key)) {
      extras.forEach((item) => seen.add(item));
    }
  }
  if (seen.size === 0) {
    for (const part of lowered.split(/\s+/).filter(Boolean)) {
      seen.add(part);
    }
  }
  return [...seen];
}

type Matcher = { token: string; test: (text: string) => boolean };

function buildMatcher(token: string): Matcher {
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(token)) {
    return { token, test: (text) => text.includes(token) };
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Short ascii tokens must stand alone ("ip" must not match "zip" or "chip");
  // longer ones may extend to the right ("yolo" matches "yolov5", "swap" matches "swapfile").
  const pattern =
    token.length <= 3
      ? new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`)
      : new RegExp(`(?<![a-z0-9])${escaped}`);
  return { token, test: (text) => pattern.test(text) };
}

function haystack(doc: IndexedDoc): { title: string; extra: string; url: string } {
  return {
    title: doc.title.toLowerCase(),
    extra: [doc.snippet, doc.text, ...(doc.breadcrumbs ?? [])].filter(Boolean).join(" ").toLowerCase(),
    url: doc.url.toLowerCase(),
  };
}

function scoreDoc(doc: IndexedDoc, matchers: Matcher[], query: string): number {
  const { title, extra, url } = haystack(doc);
  const queryTokens = matchers.map((m) => m.token);
  let score = 0;
  let matched = 0;
  let titleMatched = 0;
  for (const { token, test } of matchers) {
    let hit = false;
    if (title === token) {
      score += 14;
      hit = true;
      titleMatched += 1;
    } else if (test(title)) {
      score += 10;
      hit = true;
      titleMatched += 1;
    }
    if (test(extra)) {
      score += 3;
      hit = true;
    }
    if (test(url)) {
      score += 4;
      hit = true;
    }
    if (doc.kind === "page" && test(title)) score += 2;
    if (hit) matched += 1;
  }
  if (matchers.length > 1) {
    score += Math.round((matched / matchers.length) * 12);
    // A single incidental body/url match out of many tokens is noise, not an answer.
    if (matched === 1 && matchers.length >= 4 && titleMatched === 0) {
      score = Math.min(score, 4);
    }
  }

  const wantsBurn = queryTokens.some((token) => ["烧录", "flash", "burn", "镜像"].includes(token));
  const wantsInstall = queryTokens.some((token) => ["安装", "install"].includes(token));
  const wantsWifi = queryTokens.some((token) => ["wifi", "wi-fi", "无线"].includes(token));
  const wantsGpio = queryTokens.some((token) => token === "gpio");

  const wantsCases = queryTokens.some((token) => token === "案例");

  if (wantsBurn && /burn|xburn|flash/.test(url)) score += 10;
  if (wantsInstall && /install/.test(url) && !/cross_compile/.test(url)) score += 8;
  if (wantsWifi && /wifi|remote_login|wlan/.test(url)) score += 10;
  if (wantsGpio && /40pin|user_sample/.test(url) && /gpio/.test(url)) score += 8;
  if (wantsCases && (/\/case\/?$/.test(url) || title.includes("应用案例"))) score += 10;
  // Prefer the overview entry only among pages that already match the topic.
  if (titleMatched > 0 && (/\/overview(?:\.html)?$/.test(url) || title.includes("概述"))) score += 4;
  if (/\/faq\/|accessory|release_note|changelog|config_txt/.test(url)) score -= 6;

  const sole = soleBoard(query);
  if (sole) {
    const mine = urlLooksLikeBoard(doc.url, sole) || urlLooksLikeBoard(doc.title, sole);
    const other = (["x3", "x5", "s100", "s600"] as const)
      .filter((b) => b !== sole)
      .some((b) => urlLooksLikeBoard(doc.url, b) && !urlLooksLikeBoard(doc.url, sole));
    if (mine) score += 8;
    if (other) score -= 12;
  }

  return score;
}

function canonicalUrl(url: string): string {
  return url.split("#")[0] ?? url;
}

function lastUrlSegment(url: string): string {
  const path = canonicalUrl(url).split("/").filter(Boolean);
  return path.at(-1) || url;
}

function fillSnippet(doc: IndexedDoc): string {
  const crumbs = doc.breadcrumbs?.filter(Boolean).join(" / ");
  const filled = doc.snippet || doc.text?.slice(0, 180) || crumbs || "";
  return filled.trim() || lastUrlSegment(doc.url);
}

export function rankHits(docs: IndexedDoc[], query: string, limit: number): SearchHit[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];
  const matchers = queryTokens.map(buildMatcher);

  const best = new Map<string, SearchHit>();
  const titleFromPage = new Map<string, boolean>();
  for (const doc of docs) {
    const score = scoreDoc(doc, matchers, query);
    if (score <= 0) continue;
    const url = canonicalUrl(doc.url);
    const hit: SearchHit = {
      title: doc.title,
      url,
      manual: doc.manualId,
      snippet: fillSnippet(doc),
      score,
      source: doc.manualId === "forum" ? "forum" : "docs",
    };
    const prev = best.get(url);
    if (!prev) {
      best.set(url, hit);
      titleFromPage.set(url, doc.kind === "page");
      continue;
    }

    const prevWasPage = titleFromPage.get(url) === true;
    const nextIsPage = doc.kind === "page";
    let title = prev.title;
    if (nextIsPage && (!prevWasPage || hit.score >= prev.score)) {
      title = hit.title;
    } else if (!prevWasPage && hit.score > prev.score) {
      title = hit.title;
    }

    const winner = hit.score > prev.score ? hit : prev;
    const snippet = (hit.score > prev.score ? hit.snippet : prev.snippet) || hit.snippet || prev.snippet;
    best.set(url, { ...winner, title, snippet });
    titleFromPage.set(url, prevWasPage || nextIsPage);
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
