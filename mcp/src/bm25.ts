import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { RETRIEVAL_ALIASES } from "./aliases.js";
import { GLOSSARY_ALIASES } from "./glossary-aliases.js";
import { mentionedBoards, urlLooksLikeBoard, type BoardId } from "./products.js";
import type { IndexedDoc, SearchHit } from "./types.js";

/**
 * BM25 over heading chunks. No multilingual embedding model: MiniLM / bge-small
 * are tens to hundreds of MB and a query embed blows the cold-start budget.
 * Cold start reads the packaged posting tables (prebuilt/*.bm25.gz).
 */

const K1 = 1.2;
const B = 0.75;
const TITLE_W = 3;
const URL_W = 1.6;
const BODY_W = 1;
const BODY_CAP = 1500;
/** Terms in more than this fraction of the searched docs do not carry a concept. */
const COMMON_DF = 0.08;
/** Rarer than this, a content term is distinctive enough to abstain on. */
const RARE_DF = 0.02;
/**
 * IDF below this is a generic token (error, docker, ip). It still matches,
 * but it cannot carry a page by itself.
 */
const IDF_FLOOR = 3.2;

const ASCII = /[a-z0-9][a-z0-9_.-]*/g;
const BOARDS: BoardId[] = ["s600", "s100", "x5", "x3"];

const CJK_STOPWORDS = [
  "怎么样",
  "怎么办",
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
  "这个",
  "那个",
  "我们",
  "已经",
  "可以",
  "因为",
  "所以",
  "如果",
  "但是",
  "还是",
  "就是",
  "不是",
  "没有",
  "一个",
];

const CJK_STOP_CHARS = new Set(["的", "了", "吗", "呢", "啊", "吧", "把", "是", "有", "个", "和", "或", "在", "给", "去", "到", "太", "很"]);

const EN_STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "will",
  "how",
  "what",
  "when",
  "your",
  "into",
  "onto",
  "not",
]);

/** Collision tokens. Rare identifiers are never in this set. */
const GENERIC_ASCII = new Set([
  "error",
  "errors",
  "err",
  "type",
  "docker",
  "static",
  "dynamic",
  "install",
  "update",
  "device",
  "network",
  "system",
  "model",
  "board",
  "linux",
  "python",
  "ubuntu",
  "version",
  "default",
  "config",
  "file",
  "image",
  "driver",
  "command",
  "script",
  "test",
  "data",
  "info",
  "failed",
  "failure",
  "warning",
  "unknown",
  "invalid",
  "name",
  "path",
  "port",
  "host",
  "user",
  "root",
  "ip",
  "usb",
  "sdk",
  "api",
  "app",
  "src",
  "bin",
  "doc",
  "bad",
  "gateway",
  "pending",
  "chain",
  "target",
  "match",
]);

/** Colloquial filler. These never make a query look out of corpus. */
const CJK_FILLER = new Set([
  "一直",
  "好像",
  "提示",
  "报错",
  "失败",
  "不行",
  "没有",
  "板子",
  "这个",
  "那个",
  "怎么",
  "如何",
  "怎样",
  "是不是",
  "能不能",
  "可不可以",
  "一下",
  "已经",
  "现在",
  "直接",
  "根本",
  "老是",
  "完全",
  "还是",
  "出来",
  "进去",
  "出现",
  "起来",
  "上去",
  "下来",
  "什么",
  "哪里",
  "哪个",
  "因为",
  "所以",
  "如果",
  "但是",
  "就是",
  "不是",
  "可以",
  "应该",
  "需要",
  "问题",
  "错误",
  "之后",
  "然后",
  "或者",
  "我们",
  "你们",
  "自己",
]);

/** Path and identifier fragments that are not retrieval terms. */
const FRAGMENT_SKIP = new Set([
  "the",
  "and",
  "for",
  "doc",
  "docs",
  "html",
  "htm",
  "index",
  "source",
  "light",
  "system",
  "driver",
  "sample",
  "board",
  "user",
  "guide",
  "advanced",
  "development",
  "basic",
  "application",
  "quick",
  "start",
  "hardware",
  "software",
  "introduction",
  "manual",
  "command",
  "linux",
  "python",
  "demo",
  "example",
  "examples",
  "content",
  "category",
  "overview",
  "config",
  "txt",
  "api",
  "dev",
  "img",
  "com",
  "www",
  "http",
  "https",
  "rdk",
  "page",
  "main",
  "true",
  "false",
  "null",
  "test",
  "cn",
  "en",
  "js",
  "md",
  "www",
  "cc",
  "pdf",
]);

const SYNONYMS: Record<string, string[]> = {
  flash: ["烧录", "burn"],
  burn: ["烧录"],
  wifi: ["wi-fi", "无线", "wireless"],
  wireless: ["wifi", "无线"],
  install: ["安装"],
  uart: ["串口"],
  串口: ["uart"],
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

const ALL_SYNONYMS = mergeSynonyms(SYNONYMS, GLOSSARY_ALIASES, RETRIEVAL_ALIASES);

const S_SERIES_MANUALS = new Set(["rdk-s", "oe-s", "oe-llm-s100", "oe-llm-s600", "case-s600"]);
const X_SERIES_MANUALS = new Set(["rdk-x", "oe-x3", "oe-x5", "x5-sdk", "magicbox"]);
/** Manuals that are entirely about one board. Mixed manuals (rdk-x, rdk-s, oe-s) stay. */
const MANUAL_BOARDS: Record<string, BoardId[]> = {
  "oe-x3": ["x3"],
  "oe-x5": ["x5"],
  "x5-sdk": ["x5"],
  magicbox: ["x5"],
  "oe-llm-s100": ["s100"],
  "oe-llm-s600": ["s600"],
  "case-s600": ["s600"],
};

export type RankOptions = { board?: BoardId };

type Field = "t" | "u" | "b";
type Counts = { t: number; u: number; b: number };

type Corpus = {
  docs: IndexedDoc[];
  n: number;
  df: Map<string, number>;
  /** Flat postings: doc, titleTf, urlTf, bodyTf. */
  postings: Map<string, number[]>;
  titleDl: Float32Array;
  urlDl: Float32Array;
  bodyDl: Float32Array;
  sumTitle: number;
  sumUrl: number;
  sumBody: number;
  scores: Float64Array;
  gen: Uint32Array;
  epoch: number;
  touched: number[];
};

type Concept = { terms: string[]; keys: string[]; minHits: number; original: string[] };
type QTerm = { term: string; qtf: number };

const cache = new WeakMap<IndexedDoc[], Corpus>();
const packaged = new WeakSet<IndexedDoc[]>();
const BM25_MAGIC = 0x314d4231;

export function markPackagedIndex(docs: IndexedDoc[]): void {
  packaged.add(docs);
}

export function contextBoards(query: string, options: RankOptions = {}): BoardId[] {
  const mentioned = mentionedBoards(query);
  if (mentioned.length > 0) return mentioned;
  if (options.board) return [options.board];
  return [];
}

/** Drop the other product family before the index is even parsed. */
export function manualMatchesBoards(manualId: string, boards: BoardId[]): boolean {
  if (boards.length === 0) return true;
  const pinned = MANUAL_BOARDS[manualId];
  if (pinned && !pinned.some((board) => boards.includes(board))) return false;
  const xOnly = boards.every((board) => board === "x3" || board === "x5");
  const sOnly = boards.every((board) => board === "s100" || board === "s600");
  if (xOnly && S_SERIES_MANUALS.has(manualId)) return false;
  if (sOnly && X_SERIES_MANUALS.has(manualId)) return false;
  return true;
}

function boardsOn(doc: IndexedDoc): BoardId[] {
  return BOARDS.filter((board) => urlLooksLikeBoard(doc.url, board) || urlLooksLikeBoard(doc.title, board));
}

function docAllowed(doc: IndexedDoc, boards: BoardId[]): boolean {
  if (!manualMatchesBoards(doc.manualId, boards)) return false;
  if (boards.length === 0) return true;
  const on = boardsOn(doc);
  if (on.length === 0) return true;
  return on.some((board) => boards.includes(board));
}

const STOP_BY_FIRST = new Map<string, string[]>();
for (const stop of [...CJK_STOPWORDS].sort((a, b) => b.length - a.length)) {
  const list = STOP_BY_FIRST.get(stop[0]) ?? [];
  list.push(stop);
  STOP_BY_FIRST.set(stop[0], list);
}

function cjkSegments(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.length >= 2) out.push(buf);
    buf = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (code < 0x4e00 || code > 0x9fff) {
      flush();
      continue;
    }
    if (CJK_STOP_CHARS.has(ch)) {
      flush();
      continue;
    }
    const stops = STOP_BY_FIRST.get(ch);
    if (stops) {
      let skipped = 0;
      for (const stop of stops) {
        if (text.startsWith(stop, i)) {
          skipped = stop.length;
          break;
        }
      }
      if (skipped > 0) {
        flush();
        i += skipped - 1;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return out;
}

function urlPath(url: string): string {
  const scheme = url.indexOf("://");
  if (scheme === -1) return url;
  const slash = url.indexOf("/", scheme + 3);
  return slash === -1 ? "" : url.slice(slash);
}

function bigrams(segment: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i + 2 <= segment.length; i += 1) grams.push(segment.slice(i, i + 2));
  return grams;
}

function bump(tf: Map<string, Counts>, term: string, field: Field, amount = 1): void {
  if (term.length < 2 || EN_STOP.has(term)) return;
  if (amount < 1 && FRAGMENT_SKIP.has(term)) return;
  const row = tf.get(term) ?? { t: 0, u: 0, b: 0 };
  row[field] += amount;
  tf.set(term, row);
}

function isAsciiToken(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 45 ||
    code === 46 ||
    code === 95
  );
}

function addToken(tf: Map<string, Counts>, raw: string, field: Field): void {
  const tok = raw.toLowerCase();
  bump(tf, tok, field);
  if (!tok.includes("_") && !tok.includes("-") && !tok.includes(".")) return;
  const flat = tok.replace(/[-_.]/g, "");
  if (flat.length >= 6 && flat !== tok) bump(tf, flat, field);
  const parts = tok.split(/[-_.]+/);
  if (parts.length < 2) return;
  for (const part of parts) bump(tf, part, field, 0.5);
  if (tok.includes("x3") || tok.includes("x5") || tok.includes("s100") || tok.includes("s600")) {
    for (const board of mentionedBoards(tok)) bump(tf, board, field);
  }
}

function addCjk(tf: Map<string, Counts>, run: string, field: Field): void {
  for (const segment of cjkSegments(run)) {
    const grams = bigrams(segment);
    if (segment.length <= 8 && (grams.length !== 1 || grams[0] !== segment)) bump(tf, segment, field);
    for (const gram of grams) bump(tf, gram, field);
  }
}

function ingest(text: string, field: Field, tf: Map<string, Counts>): void {
  const n = text.length;
  let i = 0;
  let pendingNumber = "";
  while (i < n) {
    const code = text.charCodeAt(i);
    if (isAsciiToken(code)) {
      const start = i;
      i += 1;
      while (i < n && isAsciiToken(text.charCodeAt(i))) i += 1;
      const raw = text.slice(start, i);
      addToken(tf, raw, field);
      if (/^\d+$/.test(raw)) pendingNumber = raw;
      else {
        if (pendingNumber && /^[A-Za-z]{2,}$/.test(raw)) bump(tf, `${pendingNumber}${raw.toLowerCase()}`, field);
        pendingNumber = "";
      }
      continue;
    }
    if (code === 32 || code === 9) {
      i += 1;
      continue;
    }
    pendingNumber = "";
    if (code >= 0x4e00 && code <= 0x9fff) {
      const start = i;
      i += 1;
      while (i < n) {
        const next = text.charCodeAt(i);
        if (next < 0x4e00 || next > 0x9fff) break;
        i += 1;
      }
      addCjk(tf, text.slice(start, i), field);
      continue;
    }
    i += 1;
  }
}

function corpusFor(docs: IndexedDoc[]): Corpus {
  const hit = cache.get(docs);
  if (hit) return hit;
  if (packaged.has(docs)) {
    const loaded = loadPackaged(docs);
    if (loaded) {
      cache.set(docs, loaded);
      return loaded;
    }
  }
  const profile = process.env.RDK_DOCS_PROFILE === "1";
  const started = profile ? performance.now() : 0;
  let ingestMs = 0;
  const n = docs.length;
  const df = new Map<string, number>();
  const postings = new Map<string, number[]>();
  const titleDl = new Float32Array(n);
  const urlDl = new Float32Array(n);
  const bodyDl = new Float32Array(n);
  const tf = new Map<string, Counts>();
  let sumTitle = 0;
  let sumUrl = 0;
  let sumBody = 0;
  for (let i = 0; i < n; i += 1) {
    const doc = docs[i];
    tf.clear();
    const ingestStart = profile ? performance.now() : 0;
    ingest(doc.title, "t", tf);
    ingest(urlPath(doc.url), "u", tf);
    const body = [doc.snippet, doc.text, ...(doc.breadcrumbs ?? [])].filter(Boolean).join(" ");
    ingest(body.slice(0, BODY_CAP), "b", tf);
    if (profile) ingestMs += performance.now() - ingestStart;
    let titleLen = 0;
    let urlLen = 0;
    let bodyLen = 0;
    for (const [term, count] of tf) {
      titleLen += count.t;
      urlLen += count.u;
      bodyLen += count.b;
      const list = postings.get(term);
      if (list) list.push(i, count.t, count.u, count.b);
      else postings.set(term, [i, count.t, count.u, count.b]);
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    titleDl[i] = titleLen;
    urlDl[i] = urlLen;
    bodyDl[i] = bodyLen;
    sumTitle += titleLen;
    sumUrl += urlLen;
    sumBody += bodyLen;
  }
  const built: Corpus = {
    docs,
    n,
    df,
    postings,
    titleDl,
    urlDl,
    bodyDl,
    sumTitle,
    sumUrl,
    sumBody,
    scores: new Float64Array(n),
    gen: new Uint32Array(n),
    epoch: 1,
    touched: [],
  };
  cache.set(docs, built);
  if (profile) {
    let posts = 0;
    for (const list of postings.values()) posts += list.length / 4;
    process.stderr.write(
      `index ${docs[0]?.manualId ?? "?"} n=${n} terms=${postings.size} posts=${posts} ${Math.round(performance.now() - started)}ms ingest ${Math.round(ingestMs)}ms\n`,
    );
  }
  return built;
}

function analyzeQuery(query: string): { terms: QTerm[]; concepts: Concept[] } {
  const lowered = query.trim().toLowerCase();
  const concepts: Concept[] = [];
  const qmap = new Map<string, number>();

  const push = (term: string, qtf: number) => {
    if (term.length < 2 || EN_STOP.has(term)) return;
    const prev = qmap.get(term);
    if (prev === undefined || qtf > prev) qmap.set(term, qtf);
  };

  const seenAscii = new Set<string>();
  const ascii: string[] = [];
  for (const match of lowered.matchAll(ASCII)) ascii.push(match[0]);
  for (const match of lowered.matchAll(/(\d+)\s*[-_]?\s*([a-z]{2,})/g)) {
    const start = match.index ?? 0;
    if (start > 0 && /[a-z0-9]/i.test(lowered[start - 1])) continue;
    ascii.push(`${match[1]}${match[2]}`);
  }
  for (const tok of ascii) {
    if (seenAscii.has(tok) || tok.length < 2 || EN_STOP.has(tok)) continue;
    seenAscii.add(tok);
    const terms = [tok];
    if (tok.includes("_") || tok.includes("-") || tok.includes(".")) {
      const flat = tok.replace(/[-_.]/g, "");
      if (flat.length >= 6 && flat !== tok) terms.push(flat);
      for (const part of tok.split(/[-_.]+/)) if (part.length >= 2) terms.push(part);
    }
    const unique = [...new Set(terms)];
    concepts.push({ terms: unique, keys: [tok], minHits: 1, original: [...unique] });
    for (const term of terms) push(term, 1);
  }

  const pushCjk = (segment: string, scale: number) => {
    const grams = bigrams(segment);
    // A 3-character word is two overlapping bigrams. Counting each at full
    // weight lets a generic word outscore a specific identifier like v4l2.
    if (segment.length <= 2) {
      push(segment, scale);
      return;
    }
    if (segment.length <= 8) push(segment, scale);
    const share = (0.35 * scale) / Math.max(grams.length, 1);
    for (const gram of grams) push(gram, share);
  };

  for (const segment of cjkSegments(lowered)) {
    const grams = bigrams(segment);
    const cjkTerms = grams.length > 0 ? grams : [segment];
    concepts.push({
      terms: [...cjkTerms],
      keys: [segment],
      minHits: grams.length > 4 ? 2 : 1,
      original: [...cjkTerms],
    });
    pushCjk(segment, 1);
  }

  const literals = [...qmap.keys()];
  for (const term of literals) {
    const extras = ALL_SYNONYMS[term];
    if (!extras) continue;
    for (const extra of extras) {
      const piece = extra.toLowerCase();
      ASCII.lastIndex = 0;
      for (const match of piece.matchAll(ASCII)) push(match[0], 0.2);
      for (const segment of cjkSegments(piece)) pushCjk(segment, 0.2);
    }
  }

  for (const concept of concepts) {
    for (const term of concept.terms) {
      if (ALL_SYNONYMS[term]) concept.keys.push(term);
    }
    const seenKeys = new Set<string>();
    for (const key of concept.keys) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const extras = ALL_SYNONYMS[key];
      if (!extras) continue;
      for (const extra of extras) {
        for (const term of aliasTerms(extra)) {
          if (!concept.terms.includes(term)) concept.terms.push(term);
        }
      }
    }
  }

  return { terms: [...qmap].map(([term, qtf]) => ({ term, qtf })), concepts };
}

function aliasTerms(extra: string): string[] {
  const out: string[] = [];
  const piece = extra.toLowerCase();
  ASCII.lastIndex = 0;
  for (const match of piece.matchAll(ASCII)) {
    if (match[0].length >= 2) out.push(match[0]);
  }
  for (const segment of cjkSegments(piece)) {
    if (segment.length <= 8) out.push(segment);
  }
  return out;
}

function addTypoVariants(concepts: Concept[], terms: QTerm[], vocab: (term: string) => boolean): void {
  const have = new Set(terms.map((item) => item.term));
  for (const concept of concepts) {
    for (const term of [...concept.terms]) {
      if (!/^[a-z0-9]+$/.test(term) || term.length < 5 || vocab(term)) continue;
      for (let drop = 1; drop <= 3 && term.length - drop >= 4; drop += 1) {
        const prefix = term.slice(0, term.length - drop);
        if (!vocab(prefix) || FRAGMENT_SKIP.has(prefix)) continue;
        concept.terms.push(prefix);
        if (!have.has(prefix)) {
          have.add(prefix);
          terms.push({ term: prefix, qtf: 0.4 });
        }
        break;
      }
    }
  }
}

function dfOf(corpora: Corpus[], term: string): number {
  let df = 0;
  for (const corpus of corpora) df += corpus.df.get(term) ?? 0;
  return df;
}

function docHas(corpus: Corpus, term: string, docId: number): boolean {
  const list = corpus.postings.get(term);
  if (!list) return false;
  let lo = 0;
  let hi = list.length >> 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const doc = list[mid << 2];
    if (doc === docId) return true;
    if (doc < docId) lo = mid + 1;
    else hi = mid;
  }
  return false;
}

function fieldScore(tf: number, dl: number, avgdl: number): number {
  if (tf <= 0) return 0;
  const len = dl > 0 ? dl : 1;
  const avg = avgdl > 0 ? avgdl : 1;
  return (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avg));
}

function conceptMatches(corpus: Corpus, docId: number, concept: Concept, df: (term: string) => number, n: number): boolean {
  const inCorpus = concept.terms.filter((term) => df(term) > 0);
  const useful = inCorpus.filter((term) => df(term) / n < COMMON_DF);
  const pool = useful.length > 0 ? useful : inCorpus;
  if (pool.length === 0) return false;
  let present = 0;
  for (const term of pool) {
    if (docHas(corpus, term, docId)) present += 1;
  }
  return present >= concept.minHits;
}

function dampGenericIdf(idf: number): number {
  if (idf >= IDF_FLOOR) return idf;
  // Continuous fade: a token at half the floor keeps about 70% of its idf.
  return idf * (0.45 + 0.55 * (idf / IDF_FLOOR));
}

function isCjkTerm(term: string): boolean {
  const code = term.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
}

function looksLikeContent(term: string): boolean {
  if (isCjkTerm(term)) return term.length >= 2 && !CJK_FILLER.has(term);
  if (term.length < 3 || GENERIC_ASCII.has(term) || EN_STOP.has(term) || FRAGMENT_SKIP.has(term)) return false;
  return true;
}

/**
 * Ordinary English from error text. These are not package, command, API, or
 * error-code tokens, so a missing one must not set noGoodMatch.
 */
const ORDINARY_EN = new Set([
  "repository",
  "signed",
  "found",
  "join",
  "import",
  "does",
  "exist",
  "exists",
  "missing",
  "cannot",
  "please",
  "following",
  "available",
  "already",
  "something",
  "anything",
  "nothing",
  "without",
  "between",
  "through",
  "during",
  "before",
  "after",
  "where",
  "which",
  "their",
  "about",
  "other",
  "using",
  "based",
  "would",
  "could",
  "should",
  "there",
]);

/** Package, command, API, or error code. Colloquial words and prose are not. */
function isCodeLike(term: string): boolean {
  if (!looksLikeContent(term) || isCjkTerm(term) || ORDINARY_EN.has(term)) return false;
  if (term.includes("_") || term.includes(".")) return true;
  if (/[a-z]/.test(term) && /\d/.test(term)) return true;
  return /^[a-z]{4,}$/.test(term);
}

function hitContainsToken(hit: SearchHit, doc: IndexedDoc, token: string): boolean {
  const blob = `${hit.title}\n${hit.url}\n${hit.snippet}\n${doc.title}\n${doc.url}\n${doc.text ?? ""}\n${doc.snippet ?? ""}`.toLowerCase();
  return blob.includes(token.toLowerCase());
}

/**
 * True only when some package/command/API/error-code token is absent from the
 * searched manuals and the top hit does not contain it. A typo prefix that is
 * in the manuals counts as the token appearing.
 */
/** Package/command/API/error code absent from these manuals and, when present, the top hit. */
export function absentCommandToken(groups: IndexedDoc[][], query: string): boolean {
  const corpora = groups.filter((docs) => docs.length > 0).map(corpusFor);
  if (corpora.length === 0) return false;
  const plan = analyzeQuery(query);
  if (plan.concepts.length === 0) return false;
  const df = (term: string) => dfOf(corpora, term);
  addTypoVariants(plan.concepts, plan.terms, (term) => df(term) > 0);
  return missingCodeToken(plan.concepts, df, undefined);
}

function missingCodeToken(
  concepts: Concept[],
  df: (term: string) => number,
  top: { hit: SearchHit; doc: IndexedDoc } | undefined,
): boolean {
  for (const concept of concepts) {
    const codes = concept.original.filter((term) => isCodeLike(term));
    if (codes.length === 0) continue;
    if (concept.terms.some((term) => df(term) > 0)) continue;
    if (top && codes.some((term) => hitContainsToken(top.hit, top.doc, term))) continue;
    return true;
  }
  return false;
}

/** In-corpus and rare. A term that never occurs is handled on the concept, not here. */
function isDistinctiveTerm(term: string, docs: number, n: number): boolean {
  if (docs <= 0 || n <= 0 || docs / n >= RARE_DF) return false;
  return looksLikeContent(term);
}

function conceptInCorpus(concept: Concept, df: (term: string) => number): boolean {
  return concept.terms.some((term) => df(term) > 0);
}

/**
 * Concepts that can justify abstaining: fully absent content words, or rare
 * identifiers that do occur. Filler and generic collision words are left out.
 */
function distinctiveOf(concepts: Concept[], df: (term: string) => number, n: number): Concept[] {
  return concepts.filter((concept) => {
    if (!conceptInCorpus(concept, df)) return concept.terms.some((term) => looksLikeContent(term));
    return concept.terms.some((term) => isDistinctiveTerm(term, df(term), n));
  });
}

function isHowTo(query: string): boolean {
  return /怎么|如何|怎样|教程|步骤|howto|how to|how do|在哪/i.test(query);
}

function roleScale(query: string, url: string, concepts: Concept[]): number {
  const path = url.toLowerCase();
  const command = /\/cmd[_-]|command-manual|command_manual|linux-command/.test(path);
  const driver = /driver_development|\/drivers?\//.test(path);
  const guide = /user[_-]guide|user[_-]sample|basic_application|tutorial/.test(path);
  const named = concepts.some((concept) =>
    concept.terms.some((term) => term.length >= 4 && /[a-z]/.test(term) && path.includes(term)),
  );
  const aboutDriver = /驱动|driver|内核|kernel/i.test(query);
  let scale = 1;
  // Usage guides outrank a neighboring driver or command page when the
  // question is not itself about writing a driver.
  if (guide) scale *= 1.14;
  if (!named && command && isHowTo(query)) scale *= 0.8;
  if (!named && driver && !aboutDriver) scale *= 0.86;
  return scale;
}

function breadthScale(doc: IndexedDoc, bodyDl: number, avgBody: number): number {
  const text = doc.text ?? "";
  let topics = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "?" || ch === "？") topics += 1;
  }
  const ratio = avgBody > 0 ? bodyDl / avgBody : 1;
  if (ratio <= 2.2 && topics < 6 && text.length < 900) return 1;
  const extraLen = Math.max(0, ratio - 2.2);
  const extraTopics = Math.max(0, topics - 5);
  return Math.max(0.72, 1 / (1 + 0.1 * extraLen + 0.05 * extraTopics));
}

function round3(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function coverageOf(
  corpus: Corpus,
  docId: number,
  concepts: Concept[],
  df: (term: string) => number,
  n: number,
): number {
  if (concepts.length === 0) return 0;
  let hit = 0;
  for (const concept of concepts) {
    if (conceptMatches(corpus, docId, concept, df, n)) hit += 1;
  }
  return hit / concepts.length;
}

function lastUrlSegment(url: string): string {
  const path = (url.split("#")[0] ?? url).split("/").filter(Boolean);
  return path.at(-1) || url;
}

function fillSnippet(doc: IndexedDoc): string {
  const crumbs = doc.breadcrumbs?.filter(Boolean).join(" / ");
  const filled = doc.snippet || doc.text?.slice(0, 180) || crumbs || "";
  return filled.trim().slice(0, 240) || lastUrlSegment(doc.url);
}

function beginEpoch(corpus: Corpus): void {
  corpus.epoch += 1;
  if (corpus.epoch === 0xffffffff) {
    corpus.gen.fill(0);
    corpus.epoch = 1;
  }
  corpus.touched.length = 0;
}

function addScore(corpus: Corpus, doc: number, value: number): void {
  if (corpus.gen[doc] !== corpus.epoch) {
    corpus.gen[doc] = corpus.epoch;
    corpus.scores[doc] = 0;
    corpus.touched.push(doc);
  }
  corpus.scores[doc] += value;
}

export function rankCorpora(groups: IndexedDoc[][], query: string, options: RankOptions = {}): SearchHit[] {
  const corpora = groups.filter((docs) => docs.length > 0).map(corpusFor);
  if (corpora.length === 0) return [];
  const plan = analyzeQuery(query);
  if (plan.concepts.length === 0 || plan.terms.length === 0) return [];

  let n = 0;
  let sumTitle = 0;
  let sumUrl = 0;
  let sumBody = 0;
  for (const corpus of corpora) {
    n += corpus.n;
    sumTitle += corpus.sumTitle;
    sumUrl += corpus.sumUrl;
    sumBody += corpus.sumBody;
  }
  const avgTitle = n > 0 ? sumTitle / n : 1;
  const avgUrl = n > 0 ? sumUrl / n : 1;
  const avgBody = n > 0 ? sumBody / n : 1;
  const df = (term: string) => dfOf(corpora, term);
  addTypoVariants(plan.concepts, plan.terms, (term) => df(term) > 0);

  for (const corpus of corpora) beginEpoch(corpus);
  let idfMass = 0;
  for (const qterm of plan.terms) {
    const docsWith = df(qterm.term);
    if (docsWith === 0) continue;
    const idf = Math.log(1 + (n - docsWith + 0.5) / (docsWith + 0.5));
    idfMass += idf * qterm.qtf;
    const weighted = dampGenericIdf(idf);
    for (const corpus of corpora) {
      const list = corpus.postings.get(qterm.term);
      if (!list) continue;
      for (let i = 0; i < list.length; i += 4) {
        const doc = list[i];
        const sat =
          TITLE_W * fieldScore(list[i + 1], corpus.titleDl[doc], avgTitle) +
          URL_W * fieldScore(list[i + 2], corpus.urlDl[doc], avgUrl) +
          BODY_W * fieldScore(list[i + 3], corpus.bodyDl[doc], avgBody);
        addScore(corpus, doc, weighted * sat * qterm.qtf);
      }
    }
  }

  const boards = contextBoards(query, options);
  type Cand = { corpus: Corpus; doc: number; score: number; raw: number; coverage: number; confidence: number };
  const cands: Cand[] = [];
  for (const corpus of corpora) {
    for (const doc of corpus.touched) {
      const score = corpus.scores[doc];
      if (score <= 0) continue;
      if (!docAllowed(corpus.docs[doc], boards)) continue;
      cands.push({ corpus, doc, score, raw: score, coverage: 0, confidence: 0 });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const pool = cands.slice(0, 300);
  const distinctive = distinctiveOf(plan.concepts, df, n);
  for (const cand of pool) {
    const doc = cand.corpus.docs[cand.doc];
    cand.raw =
      cand.score *
      breadthScale(doc, cand.corpus.bodyDl[cand.doc], avgBody) *
      roleScale(query, doc.url, plan.concepts);
    cand.coverage = coverageOf(cand.corpus, cand.doc, plan.concepts, df, n);
    cand.score = cand.raw * (0.15 + 0.85 * cand.coverage);
    const norm = idfMass > 0 ? cand.raw / idfMass : 0;
    let available = 0;
    let onHit = 0;
    for (const concept of distinctive) {
      if (!conceptInCorpus(concept, df)) continue;
      available += 1;
      if (conceptMatches(cand.corpus, cand.doc, concept, df, n)) onHit += 1;
    }
    const scorePart = Math.max(0, Math.min(1, norm / 2.2));
    cand.confidence = available === 0 ? round3(scorePart) : round3(0.75 * (onHit / available) + 0.25 * scorePart);
  }
  pool.sort((a, b) => b.score - a.score || a.doc - b.doc);

  const best = new Map<string, { hit: SearchHit; page: boolean; doc: IndexedDoc }>();
  for (const cand of pool) {
    const doc = cand.corpus.docs[cand.doc];
    const base = doc.url.split("#")[0] ?? doc.url;
    const on = boardsOn(doc);
    const coverage = cand.coverage;
    const hit: SearchHit = {
      title: doc.title,
      url: doc.url,
      manual: doc.manualId,
      snippet: fillSnippet(doc),
      score: cand.score,
      source: doc.manualId === "forum" ? "forum" : "docs",
      board: on.length === 1 ? on[0] : on.length > 1 ? "multiple" : undefined,
      quality: "good",
      coverage: Math.round(coverage * 1000) / 1000,
      confidence: cand.confidence,
    };
    const prev = best.get(base);
    if (!prev) {
      best.set(base, { hit, page: doc.kind === "page", doc });
      continue;
    }
    const nextIsPage = doc.kind === "page";
    let title = prev.hit.title;
    if (nextIsPage && (!prev.page || hit.score >= prev.hit.score)) title = hit.title;
    else if (!prev.page && hit.score > prev.hit.score) title = hit.title;
    const winner = hit.score > prev.hit.score ? hit : prev.hit;
    const snippet = hit.score > prev.hit.score ? hit.snippet : prev.hit.snippet;
    const url = hit.score > prev.hit.score ? hit.url : prev.hit.url;
    const coverageOut = hit.score > prev.hit.score ? hit.coverage : prev.hit.coverage;
    const confidenceOut = hit.score > prev.hit.score ? hit.confidence : prev.hit.confidence;
    const winnerDoc = hit.score > prev.hit.score ? doc : prev.doc;
    best.set(base, {
      hit: {
        ...winner,
        title,
        snippet: snippet || hit.snippet || prev.hit.snippet,
        url,
        score: Math.max(hit.score, prev.hit.score),
        coverage: coverageOut,
        confidence: confidenceOut,
        quality: "good",
      },
      page: prev.page || nextIsPage,
      doc: winnerDoc,
    });
  }

  const ranked = [...best.values()].sort((a, b) => b.hit.score - a.hit.score || a.hit.url.localeCompare(b.hit.url));
  if (missingCodeToken(plan.concepts, df, ranked[0])) {
    for (const item of ranked) item.hit.quality = "weak";
  }
  return ranked.map((item) => item.hit);
}

function quantize(tf: number): number {
  return Math.max(0, Math.min(255, Math.round(tf * 2)));
}

/** Posting lists for a packaged manual. Cold start reads this instead of tokenizing. */
export function encodeBm25(docs: IndexedDoc[]): Buffer {
  const corpus = corpusFor(docs);
  const terms = [...corpus.postings.keys()];
  let bytes = 20 + corpus.n * 12 + 4;
  for (const term of terms) {
    const list = corpus.postings.get(term);
    bytes += 2 + Buffer.byteLength(term) + 4 + ((list?.length ?? 0) / 4) * 7;
  }
  const buf = Buffer.allocUnsafe(bytes);
  let o = 0;
  buf.writeUInt32LE(BM25_MAGIC, o);
  o += 4;
  buf.writeUInt32LE(corpus.n, o);
  o += 4;
  buf.writeFloatLE(corpus.sumTitle, o);
  o += 4;
  buf.writeFloatLE(corpus.sumUrl, o);
  o += 4;
  buf.writeFloatLE(corpus.sumBody, o);
  o += 4;
  for (let i = 0; i < corpus.n; i += 1) {
    buf.writeFloatLE(corpus.titleDl[i], o);
    buf.writeFloatLE(corpus.urlDl[i], o + 4);
    buf.writeFloatLE(corpus.bodyDl[i], o + 8);
    o += 12;
  }
  buf.writeUInt32LE(terms.length, o);
  o += 4;
  for (const term of terms) {
    const raw = Buffer.from(term);
    buf.writeUInt16LE(raw.length, o);
    o += 2;
    raw.copy(buf, o);
    o += raw.length;
    const list = corpus.postings.get(term) ?? [];
    const count = list.length / 4;
    buf.writeUInt32LE(count, o);
    o += 4;
    for (let i = 0; i < list.length; i += 4) {
      buf.writeUInt32LE(list[i], o);
      buf[o + 4] = quantize(list[i + 1]);
      buf[o + 5] = quantize(list[i + 2]);
      buf[o + 6] = quantize(list[i + 3]);
      o += 7;
    }
  }
  return buf.subarray(0, o);
}

function decodeBm25(buf: Buffer, docs: IndexedDoc[]): Corpus {
  let o = 0;
  const magic = buf.readUInt32LE(o);
  o += 4;
  if (magic !== BM25_MAGIC) throw new Error("bm25 cache magic mismatch");
  const n = buf.readUInt32LE(o);
  o += 4;
  if (n !== docs.length) throw new Error("bm25 cache doc count mismatch");
  const sumTitle = buf.readFloatLE(o);
  o += 4;
  const sumUrl = buf.readFloatLE(o);
  o += 4;
  const sumBody = buf.readFloatLE(o);
  o += 4;
  const titleDl = new Float32Array(n);
  const urlDl = new Float32Array(n);
  const bodyDl = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    titleDl[i] = buf.readFloatLE(o);
    urlDl[i] = buf.readFloatLE(o + 4);
    bodyDl[i] = buf.readFloatLE(o + 8);
    o += 12;
  }
  const termCount = buf.readUInt32LE(o);
  o += 4;
  const df = new Map<string, number>();
  const postings = new Map<string, number[]>();
  for (let t = 0; t < termCount; t += 1) {
    const len = buf.readUInt16LE(o);
    o += 2;
    const term = buf.toString("utf8", o, o + len);
    o += len;
    const count = buf.readUInt32LE(o);
    o += 4;
    const list = new Array<number>(count * 4);
    for (let i = 0; i < count; i += 1) {
      const at = i * 4;
      list[at] = buf.readUInt32LE(o);
      list[at + 1] = buf[o + 4] / 2;
      list[at + 2] = buf[o + 5] / 2;
      list[at + 3] = buf[o + 6] / 2;
      o += 7;
    }
    postings.set(term, list);
    df.set(term, count);
  }
  return {
    docs,
    n,
    df,
    postings,
    titleDl,
    urlDl,
    bodyDl,
    sumTitle,
    sumUrl,
    sumBody,
    scores: new Float64Array(n),
    gen: new Uint32Array(n),
    epoch: 1,
    touched: [],
  };
}

function loadPackaged(docs: IndexedDoc[]): Corpus | undefined {
  const manualId = docs[0]?.manualId;
  if (!manualId) return undefined;
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "prebuilt", `${manualId}.bm25.gz`);
  if (!existsSync(path)) return undefined;
  try {
    return decodeBm25(gunzipSync(readFileSync(path)), docs);
  } catch {
    return undefined;
  }
}
