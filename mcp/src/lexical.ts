import { CONCEPT_SYNONYMS } from "./aliases.js";
import { GLOSSARY_ALIASES } from "./glossary-aliases.js";
import type { IndexedDoc } from "./types.js";

/**
 * Title scorer fused with BM25 by reciprocal rank. It scores query tokens
 * against the title and body. It does not look at URL path classes, page
 * names, or which manual section a link points at.
 */

const CJK_STOPWORDS = ["怎么样", "怎么", "怎样", "如何", "什么", "哪些", "哪里", "是否", "多少", "请问", "帮我", "一下", "可不可以", "能不能", "有没有"];
const CJK_STOP_CHARS = new Set(["的", "了", "吗", "呢", "啊", "吧", "把", "是", "有", "个", "和", "或", "在", "给", "去", "到", "太", "很"]);

/** English function words. They are not retrieval terms. */
const LEX_STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "not",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "from",
  "into",
  "onto",
  "by",
  "at",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "do",
  "does",
  "did",
  "can",
  "will",
  "how",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "we",
  "you",
  "your",
  "it",
  "if",
  "check",
  "please",
  "just",
  "about",
  "than",
  "then",
  "there",
  "here",
]);

/** Generic words that collide across manuals. A title made of these is not an answer. */
const WEAK_TITLE = new Set([
  "docker",
  "error",
  "errors",
  "static",
  "install",
  "network",
  "system",
  "default",
  "config",
  "board",
  "linux",
  "image",
  "device",
  "type",
  "file",
  "user",
  "root",
  "info",
  "test",
  "data",
]);

const BASE_SYNONYMS: Record<string, string[]> = {
  flash: ["烧录", "burn"],
  burn: ["烧录"],
  wifi: ["wi-fi", "无线"],
  install: ["安装"],
};

function mergeSynonyms(...maps: Array<Record<string, string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const map of maps) {
    for (const [key, extras] of Object.entries(map)) {
      out[key] = [...new Set([...(out[key] ?? []), ...extras])];
    }
  }
  return out;
}

function activeSynonyms(): Record<string, string[]> {
  const concept = (process.env.RDK_ABLATE ?? "").split(",").includes("synonym") ? {} : CONCEPT_SYNONYMS;
  return mergeSynonyms(BASE_SYNONYMS, GLOSSARY_ALIASES, concept);
}

const CJK_RUN = /[\u4e00-\u9fff]+/g;

export type LexicalPlan = {
  tokens: string[];
  matchers: Array<{ token: string; test: (text: string) => boolean }>;
};

function cjkBigrams(query: string): string[] {
  const grams: string[] = [];
  for (const match of query.matchAll(CJK_RUN)) {
    let run = match[0];
    for (const stop of CJK_STOPWORDS) run = run.replaceAll(stop, "\u0000");
    run = [...run].map((ch) => (CJK_STOP_CHARS.has(ch) ? "\u0000" : ch)).join("");
    for (const segment of run.split("\u0000")) {
      if (segment.length < 2) continue;
      for (let i = 0; i + 2 <= segment.length; i += 1) grams.push(segment.slice(i, i + 2));
    }
  }
  return grams;
}

export function lexicalTokens(query: string): string[] {
  const seen = new Set<string>();
  const lowered = query.trim().toLowerCase();
  const add = (token: string) => {
    if (!token || LEX_STOP.has(token)) return;
    seen.add(token);
  };
  for (const match of lowered.matchAll(/[a-z][a-z0-9_.-]*|\d+[a-z][a-z0-9_.-]*|\d+/g)) add(match[0]);
  for (const match of lowered.matchAll(/(\d+)[\s-]+([a-z][a-z0-9_.-]*)/g)) add(`${match[1]}${match[2]}`);
  for (const gram of cjkBigrams(lowered)) add(gram);
  for (const [key, extras] of Object.entries(activeSynonyms())) {
    if (!seen.has(key)) continue;
    for (const item of extras) add(item.toLowerCase());
  }
  if (seen.size === 0) {
    for (const part of lowered.split(/\s+/).filter(Boolean)) add(part);
  }
  return [...seen];
}

function buildMatcher(token: string): { token: string; test: (text: string) => boolean } {
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(token)) return { token, test: (text) => text.includes(token) };
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern =
    token.length <= 3 ? new RegExp(`(?<![a-z])${escaped}(?![a-z])`) : new RegExp(`(?<![a-z0-9])${escaped}`);
  return { token, test: (text) => pattern.test(text) };
}

const planCache = new Map<string, LexicalPlan>();

export function prepareLexical(query: string): LexicalPlan {
  const cached = planCache.get(query);
  if (cached) return cached;
  if (planCache.size > 64) planCache.clear();
  const tokens = lexicalTokens(query);
  const plan = { tokens, matchers: tokens.map(buildMatcher) };
  planCache.set(query, plan);
  return plan;
}

/** A landing page is a short label (a board or product name) with no procedure text. */
export function isThinLanding(doc: IndexedDoc): boolean {
  if (structureScale(doc) > 1) return false;
  const text = (doc.text ?? "").trim();
  if (text.length >= 80) return false;
  const tokens = doc.title
    .trim()
    .split(/[\s/|:_-]+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0 || tokens.length > 3) return false;
  // A content word in the title is a topic page, even when the stored snippet is short.
  if (tokens.some((token) => /[\u4e00-\u9fff]{2,}/.test(token) || /[a-z]{5,}/i.test(token))) return false;
  return true;
}

/**
 * Corpus-independent shape of a how-to section: a guide-style heading,
 * numbered steps, or code blocks. No URL or page name is consulted.
 */
export function structureScale(doc: IndexedDoc): number {
  const text = doc.text ?? "";
  const title = doc.title.trim();
  const steps = text.match(/(?:^|\n)\s*\d+[.、)]|第[0-9一二三四五六七八九十]{1,3}步/g)?.length ?? 0;
  const code = text.match(/```|`[^`\n]{2,}`/g)?.length ?? 0;
  const guideTitle = /^(?:\d+\.)+\d*\s+\S/.test(title) || /指南|教程|步骤|示例|howto|\btutorial\b|\bguide\b/i.test(title);
  if (steps >= 2 || code >= 2) return guideTitle ? 1.22 : 1.15;
  if (steps === 1 || code === 1 || guideTitle) return 1.08;
  return 1;
}

/**
 * Title fusion weight. High enough that a title match moves a near neighbor,
 * low enough that a rare BM25 hit stays ahead of a generic title.
 */
export const LEX_FUSION_WEIGHT = 0.22;

/** Reciprocal-rank fusion. Rank 0 is the best rank. */
export function fuseRanks(bmRank: number, lexRank: number, lexWeight = LEX_FUSION_WEIGHT, k = 10): number {
  return 1 / (k + bmRank) + lexWeight / (k + lexRank);
}

export function lexicalScore(doc: IndexedDoc, plan: LexicalPlan): number {
  const title = doc.title.toLowerCase();
  const extra = [doc.snippet, doc.text, ...(doc.breadcrumbs ?? [])].filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  let matched = 0;
  let titleMatched = 0;
  for (const matcher of plan.matchers) {
    // A title made only of generic words (docker, error, install) is not an answer.
    if (WEAK_TITLE.has(matcher.token)) {
      if (matcher.test(extra)) {
        score += 1;
        matched += 1;
      }
      continue;
    }
    let hit = false;
    if (title === matcher.token) {
      score += 14;
      hit = true;
      titleMatched += 1;
    } else if (matcher.test(title)) {
      score += 10;
      hit = true;
      titleMatched += 1;
    }
    if (matcher.test(extra)) {
      score += 3;
      hit = true;
    }
    if (doc.kind === "page" && matcher.test(title)) score += 2;
    if (hit) matched += 1;
  }
  if (plan.matchers.length > 1) {
    score += Math.round((matched / plan.matchers.length) * 12);
    if (matched === 1 && plan.matchers.length >= 4 && titleMatched === 0) score = Math.min(score, 4);
  }
  return score;
}
