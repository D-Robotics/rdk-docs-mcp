import type { IndexedDoc, SearchHit } from "./types.js";

const CJK_TERMS = [
  "烧录",
  "镜像",
  "安装",
  "量化",
  "开机",
  "上手",
  "案例",
  "示例",
  "应用",
  "供电",
  "调试",
  "概述",
  "快速",
  "指南",
  "配置",
  "登录",
  "无线",
  "交叉",
  "编译",
  "散热",
];

const SYNONYMS: Record<string, string[]> = {
  flash: ["烧录", "burn"],
  burn: ["烧录"],
  wifi: ["wi-fi", "无线"],
  install: ["安装"],
};

function tokens(query: string): string[] {
  const seen = new Set<string>();
  for (const part of query.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    seen.add(part);
    for (const match of part.matchAll(/[a-z][a-z0-9_-]*|\d+/g)) {
      seen.add(match[0]);
    }
    for (const term of CJK_TERMS) {
      if (part.includes(term)) seen.add(term);
    }
    for (const [key, extras] of Object.entries(SYNONYMS)) {
      if (part === key) {
        extras.forEach((item) => seen.add(item));
      }
    }
  }
  return [...seen];
}

function haystack(doc: IndexedDoc): { title: string; extra: string; url: string } {
  return {
    title: doc.title.toLowerCase(),
    extra: [doc.snippet, doc.text, ...(doc.breadcrumbs ?? [])].filter(Boolean).join(" ").toLowerCase(),
    url: doc.url.toLowerCase(),
  };
}

function scoreDoc(doc: IndexedDoc, queryTokens: string[]): number {
  const { title, extra, url } = haystack(doc);
  let score = 0;
  let matched = 0;
  for (const token of queryTokens) {
    let hit = false;
    if (title === token) {
      score += 14;
      hit = true;
    } else if (title.includes(token)) {
      score += 10;
      hit = true;
    }
    if (extra.includes(token)) {
      score += 3;
      hit = true;
    }
    if (url.includes(token)) {
      score += 4;
      hit = true;
    }
    if (doc.kind === "page" && title.includes(token)) score += 2;
    if (hit) matched += 1;
  }
  if (queryTokens.length > 1) {
    score += Math.round((matched / queryTokens.length) * 12);
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
  if (/\/overview(?:\.html)?$/.test(url) || title.includes("概述")) score += 4;
  if (/\/faq\/|accessory|release_note|changelog|config_txt/.test(url)) score -= 6;

  return score;
}

function canonicalUrl(url: string): string {
  return url.split("#")[0] ?? url;
}

export function rankHits(docs: IndexedDoc[], query: string, limit: number): SearchHit[] {
  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return [];

  const best = new Map<string, SearchHit>();
  for (const doc of docs) {
    const score = scoreDoc(doc, queryTokens);
    if (score <= 0) continue;
    const url = canonicalUrl(doc.url);
    const hit: SearchHit = {
      title: doc.kind === "snippet" && doc.snippet ? doc.title : doc.title,
      url,
      manual: doc.manualId,
      snippet: doc.snippet ?? doc.breadcrumbs?.join(" / ") ?? "",
      score,
      source: doc.manualId === "forum" ? "forum" : "docs",
    };
    const prev = best.get(url);
    if (!prev || hit.score > prev.score) {
      best.set(url, hit);
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
