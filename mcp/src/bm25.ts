import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { CONCEPT_SYNONYMS, RETRIEVAL_ALIASES } from "./aliases.js";
import { MANUALS } from "./catalog.js";
import { GLOSSARY_ALIASES } from "./glossary-aliases.js";
import { fuseRanks, isThinLanding, lexicalScore, prepareLexical, structureScale } from "./lexical.js";
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
/** FAQ answer tokens. Half a body hit, and well below a title hit (weight 3). */
const ANSWER_TF = 0.5;
const SCAN_CAP = 280;
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
  "vs",
  "via",
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

const ALL_SYNONYMS = mergeSynonyms(SYNONYMS, GLOSSARY_ALIASES, RETRIEVAL_ALIASES, CONCEPT_SYNONYMS);
const SYNONYMS_WITHOUT_CONCEPT = mergeSynonyms(SYNONYMS, GLOSSARY_ALIASES, RETRIEVAL_ALIASES);

function ablate(part: string): boolean {
  return (process.env.RDK_ABLATE ?? "")
    .split(",")
    .map((item) => item.trim())
    .includes(part);
}

function synonymExtras(term: string): string[] | undefined {
  return (ablate("synonym") ? SYNONYMS_WITHOUT_CONCEPT : ALL_SYNONYMS)[term];
}

const BOARD_TOKEN = new Set(["x3", "x5", "s100", "s600", "s100p", "rdk"]);

/** Long manual aliases. A typo of one of these still names that manual. */
const MANUAL_ALIAS_TARGETS: Array<{ alias: string; term: string }> = [];
for (const manual of MANUALS) {
  for (const alias of manual.aliases) {
    const key = alias.toLowerCase();
    if (key.length < 6 || BOARD_TOKEN.has(key)) continue;
    MANUAL_ALIAS_TARGETS.push({ alias: key, term: manual.id });
  }
}

const S_SERIES_MANUALS = new Set(["rdk-s", "oe-s", "oe-llm-s100", "oe-llm-s600", "case-s600"]);
const X_SERIES_MANUALS = new Set(["rdk-x", "rdk-ultra", "oe-x3", "oe-x5", "x5-sdk", "magicbox"]);
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

/** Decode the packaged posting table so the first query does not pay for it. */
export function primeIndex(docs: IndexedDoc[]): void {
  if (docs.length === 0) return;
  corpusFor(docs);
}

export function contextBoards(query: string, options: RankOptions = {}): BoardId[] {
  const mentioned = mentionedBoards(query);
  if (mentioned.length > 0) return mentioned;
  if (options.board) return [options.board];
  return [];
}

/** Drop the other product family before the index is even parsed. */
function manualHasNoBoard(manualId: string): boolean {
  return MANUALS.some((manual) => manual.id === manualId && manual.noBoard === true);
}

export function manualMatchesBoards(manualId: string, boards: BoardId[]): boolean {
  if (boards.length === 0) return true;
  if (manualHasNoBoard(manualId)) return false;
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
  // Family filter only. A URL that names another board is down-weighted in
  // boardScale, not deleted: the hard drop was removing X5 answers.
  return manualMatchesBoards(doc.manualId, boards);
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

function bump(tf: Map<string, Counts>, term: string, field: Field, amount = 1, ceiling?: number): void {
  if (term.length < 2 || EN_STOP.has(term)) return;
  if (amount < 1 && FRAGMENT_SKIP.has(term)) return;
  const row = tf.get(term) ?? { t: 0, u: 0, b: 0 };
  if (ceiling !== undefined && row[field] >= ceiling) return;
  row[field] += amount;
  if (ceiling !== undefined && row[field] > ceiling) row[field] = ceiling;
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

function addToken(tf: Map<string, Counts>, raw: string, field: Field, scale = 1, ceiling?: number): void {
  const tok = raw.toLowerCase();
  bump(tf, tok, field, scale, ceiling);
  if (!tok.includes("_") && !tok.includes("-") && !tok.includes(".")) return;
  const flat = tok.replace(/[-_.]/g, "");
  if (flat.length >= 6 && flat !== tok) bump(tf, flat, field, scale, ceiling);
  const parts = tok.split(/[-_.]+/);
  if (parts.length < 2) return;
  for (const part of parts) bump(tf, part, field, 0.5 * scale, ceiling);
  // A path segment that already splits out the board id (driver_development_x5)
  // is counted above. Only glued forms (rdkx5) need a separate board term.
  if (tok.includes("x3") || tok.includes("x5") || tok.includes("s100") || tok.includes("s600")) {
    for (const board of mentionedBoards(tok)) {
      if (parts.includes(board)) continue;
      bump(tf, board, field, 0.5 * scale, ceiling);
    }
  }
}

function addCjk(tf: Map<string, Counts>, run: string, field: Field, scale = 1, ceiling?: number): void {
  for (const segment of cjkSegments(run)) {
    const grams = bigrams(segment);
    if (segment.length <= 8 && (grams.length !== 1 || grams[0] !== segment)) bump(tf, segment, field, scale, ceiling);
    for (const gram of grams) bump(tf, gram, field, scale, ceiling);
  }
}

function ingest(text: string, field: Field, tf: Map<string, Counts>, scale = 1, ceiling?: number): void {
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
      addToken(tf, raw, field, scale, ceiling);
      if (/^\d+$/.test(raw)) pendingNumber = raw;
      else {
        if (pendingNumber && /^[A-Za-z]{2,}$/.test(raw)) bump(tf, `${pendingNumber}${raw.toLowerCase()}`, field, scale, ceiling);
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
      addCjk(tf, text.slice(start, i), field, scale, ceiling);
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
    if (doc.answer) ingest(doc.answer.slice(0, BODY_CAP), "b", tf, ANSWER_TF, ANSWER_TF);
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
    const extras = synonymExtras(term);
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
      const extras = synonymExtras(key);
      if (!extras) continue;
      for (const extra of extras) {
        for (const term of aliasTerms(extra)) {
          if (!concept.terms.includes(term)) concept.terms.push(term);
        }
      }
    }
  }

  const phrasePush = (term: string, qtf: number) => {
    push(term, qtf);
  };
  for (const { alias, term } of MANUAL_ALIAS_TARGETS) {
    if (lowered.includes(alias)) phrasePush(term, 1);
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

const ALPHA = "abcdefghijklmnopqrstuvwxyz";

function editNeighbors(term: string): string[] {
  const out: string[] = [];
  const n = term.length;
  for (let i = 0; i < n; i += 1) out.push(term.slice(0, i) + term.slice(i + 1));
  for (let i = 0; i < n - 1; i += 1) {
    if (term[i] === term[i + 1]) continue;
    out.push(term.slice(0, i) + term[i + 1] + term[i] + term.slice(i + 2));
  }
  for (let i = 0; i < n; i += 1) {
    const cur = term[i];
    for (let c = 0; c < ALPHA.length; c += 1) {
      const ch = ALPHA[c];
      if (ch === cur) continue;
      out.push(term.slice(0, i) + ch + term.slice(i + 1));
    }
  }
  for (let i = 0; i <= n; i += 1) {
    for (let c = 0; c < ALPHA.length; c += 1) out.push(term.slice(0, i) + ALPHA[c] + term.slice(i));
  }
  return out;
}

function rememberTerm(concept: Concept, terms: QTerm[], have: Set<string>, term: string, qtf: number): void {
  if (!concept.terms.includes(term)) concept.terms.push(term);
  if (!have.has(term)) {
    have.add(term);
    terms.push({ term, qtf });
  }
  const extras = synonymExtras(term);
  if (!extras) return;
  for (const extra of extras) {
    for (const piece of aliasTerms(extra)) {
      if (have.has(piece)) continue;
      rememberTerm(concept, terms, have, piece, qtf * 0.7);
    }
  }
}

function addTypoVariants(concepts: Concept[], terms: QTerm[], df: (term: string) => number): void {
  const have = new Set(terms.map((item) => item.term));
  const vocab = (term: string) => df(term) > 0;
  for (const concept of concepts) {
    for (const term of [...concept.terms]) {
      if (!/^[a-z0-9]+$/.test(term) || term.length < 4 || vocab(term)) continue;
      if (term.length >= 5) {
        for (let drop = 1; drop <= 3 && term.length - drop >= 4; drop += 1) {
          const prefix = term.slice(0, term.length - drop);
          if (!vocab(prefix) || FRAGMENT_SKIP.has(prefix)) continue;
          rememberTerm(concept, terms, have, prefix, 0.45);
          break;
        }
      }
      // One edit: wfii → wifi, statc → static. Ambiguous corrections are skipped.
      if (term.length <= 12) {
      let best = "";
      let bestDf = 0;
      let second = 0;
      const seen = new Set<string>();
      for (const neighbor of editNeighbors(term)) {
        if (neighbor.length < 4 || seen.has(neighbor) || FRAGMENT_SKIP.has(neighbor) || EN_STOP.has(neighbor)) continue;
        if (ORDINARY_EN.has(neighbor) || GENERIC_ASCII.has(neighbor)) continue;
        // A different first letter is a different word (pending → sending), not a typo.
        if (neighbor[0] !== term[0] && !ALL_SYNONYMS[neighbor]) continue;
        // "iphone" is one deletion away from "phone". A neighbor that is just
        // a piece of the typed token is not a typo correction.
        if (term.includes(neighbor) || neighbor.includes(term)) continue;
        const inserted = Math.abs(neighbor.length - term.length) === 1;
        if (inserted && !ALL_SYNONYMS[neighbor] && !ALL_SYNONYMS[term]) continue;
        seen.add(neighbor);
        const docs = df(neighbor);
        if (docs <= 0) continue;
        if (docs > bestDf) {
          second = bestDf;
          bestDf = docs;
          best = neighbor;
        } else if (docs > second) second = docs;
      }
        for (const { alias, term: manualTerm } of MANUAL_ALIAS_TARGETS) {
          if (alias === term || Math.abs(alias.length - term.length) > 1) continue;
          if (!editNeighbors(term).includes(alias) && alias !== term) continue;
          rememberTerm(concept, terms, have, manualTerm, 0.8);
        }
        const transposed =
          best.length === term.length &&
          [...term].some((_, index) => index < term.length - 1 && term[index] !== term[index + 1] && best === term.slice(0, index) + term[index + 1] + term[index] + term.slice(index + 2));
        // helm → held is one substitution and not a typo. wfii → wifi is a swap.
        const shortSubstitution = term.length < 5 && !transposed && !ALL_SYNONYMS[best];
        if (best && !shortSubstitution && (second === 0 || bestDf >= second * 3)) rememberTerm(concept, terms, have, best, 0.7);
      }
    }
  }
}

const prefixCache = new WeakMap<Map<string, number>, Map<string, string[]>>();

function prefixIndex(dfMap: Map<string, number>): Map<string, string[]> {
  const cached = prefixCache.get(dfMap);
  if (cached) return cached;
  const index = new Map<string, string[]>();
  for (const term of dfMap.keys()) {
    if (term.length < 5 || term.length > 24 || !/^[a-z][a-z0-9]*$/.test(term)) continue;
    const key = term.slice(0, 4);
    const list = index.get(key);
    if (list) {
      if (list.length < 16) list.push(term);
    } else index.set(key, [term]);
  }
  prefixCache.set(dfMap, index);
  return index;
}

function expandPrefixes(
  concepts: Concept[],
  terms: QTerm[],
  corpora: Corpus[],
  present: (term: string) => number = (term) => dfOf(corpora, term),
): void {
  const maps = corpora.map((corpus) => prefixIndex(corpus.df));
  const have = new Set(terms.map((item) => item.term));
  const df = present;
  for (const concept of concepts) {
    for (const term of [...concept.original]) {
      if (!/^[a-z][a-z0-9]*$/.test(term) || term.length < 4 || term.length > 8 || df(term) > 0) continue;
      if (GENERIC_ASCII.has(term) || FRAGMENT_SKIP.has(term) || BOARD_TOKEN.has(term)) continue;
      const found = new Set<string>();
      for (const map of maps) {
        const list = map.get(term.slice(0, 4));
        if (!list) continue;
        for (const candidate of list) {
          if (!candidate.startsWith(term) || candidate.length <= term.length) continue;
          // yolo → yolov5. An open-ended prefix (helm → helmfile) is not a version.
          const rest = candidate.slice(term.length);
          if (!/^v?\d/.test(rest)) continue;
          if (df(candidate) <= 0) continue;
          found.add(candidate);
        }
      }
      if (found.size === 0 || found.size > 12) continue;
      for (const candidate of found) rememberTerm(concept, terms, have, candidate, 0.65);
    }
  }
}

function dfOf(corpora: Corpus[], term: string): number {
  let df = 0;
  for (const corpus of corpora) df += corpus.df.get(term) ?? 0;
  return df;
}

/**
 * Document frequency ignoring FAQ-answer-only hits. A word that shows up only
 * in an answer must not make an out-of-scope query look in-corpus. Title, URL,
 * and ordinary body text still count. Answer tf is stored at 0.5.
 */
function dfOutsideAnswers(corpora: Corpus[], term: string): number {
  let n = 0;
  for (const corpus of corpora) {
    const list = corpus.postings.get(term);
    if (!list) continue;
    for (let i = 0; i < list.length; i += 4) {
      if (list[i + 1] > 0 || list[i + 2] > 0 || list[i + 3] > 0.5) n += 1;
    }
  }
  return n;
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
  "help",
  "install",
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

/** True when the query has no RDK-specific term in these manuals. */
export function absentCommandToken(groups: IndexedDoc[][], query: string): boolean {
  const corpora = groups.filter((docs) => docs.length > 0).map(corpusFor);
  if (corpora.length === 0) return false;
  const plan = analyzeQuery(query);
  if (plan.concepts.length === 0) return false;
  const df = (term: string) => dfOf(corpora, term);
  let n = 0;
  for (const corpus of corpora) n += corpus.n;
  adaptPlan(plan, query, df, n);
  if (!ablate("typo")) addTypoVariants(plan.concepts, plan.terms, df);
  return !plan.concepts.some((concept) => conceptDomain(concept, df, n));
}

/**
 * Everyday words that show up in any manual. They are not an RDK match.
 * Product vocabulary (board ids, hobot, tros, bpu) is not in this set;
 * those are accepted from corpus document frequency instead.
 */
const EVERYDAY = new Set([
  "login",
  "password",
  "account",
  "email",
  "server",
  "client",
  "database",
  "session",
  "guard",
  "check",
  "update",
  "version",
  "host",
  "port",
  "user",
  "name",
  "path",
  "file",
  "data",
  "info",
  "command",
  "script",
  "device",
  "image",
  "board",
  "model",
  "python",
  "ubuntu",
  "linux",
  "windows",
  "phone",
  "http",
  "https",
  "www",
  "app",
  "git",
  "node",
  "npm",
  "登录",
  "安装",
  "系统",
  "网络",
  "密码",
  "账号",
  "账户",
  "用户",
  "文件",
  "配置",
  "默认",
  "错误",
  "设备",
  "地址",
  "连接",
  "方法",
  "问题",
  "支持",
  "版本",
  "命令",
  "接口",
  "使用",
  "无线",
  "电脑",
  "软件",
  "工具",
  "环境",
  "依赖",
  "服务",
]);

function isGeneralLanguage(term: string): boolean {
  if (BOARD_TOKEN.has(term)) return false;
  if (EVERYDAY.has(term) || GENERIC_ASCII.has(term) || EN_STOP.has(term) || CJK_FILLER.has(term) || ORDINARY_EN.has(term)) return true;
  return !isCjkTerm(term) && !looksLikeContent(term);
}

/** In the manuals, and not ordinary vocabulary. Board ids count even when short. */
function isDomainTerm(term: string, docs: number): boolean {
  if (docs <= 0 || isGeneralLanguage(term)) return false;
  if (BOARD_TOKEN.has(term)) return true;
  return looksLikeContent(term);
}

/** A concept matches the manuals when one of its terms is RDK-specific there. */
function conceptDomain(concept: Concept, df: (term: string) => number, n: number): boolean {
  const head = concept.keys[0];
  const skipBigrams = Boolean(head && isCjkTerm(head) && head.length > 2);
  const consider = (term: string, original: boolean) => {
    if (skipBigrams && original && isCjkTerm(term) && head && term.length < head.length) return false;
    return isDomainTerm(term, df(term));
  };
  if (concept.keys.some((term) => consider(term, true))) return true;
  if (concept.original.some((term) => consider(term, true))) return true;
  return concept.terms.some((term) => !concept.original.includes(term) && consider(term, false));
}

/** No original or alias of this concept occurs in the manuals. Stray bigrams do not count. */
function conceptAbsent(concept: Concept, df: (term: string) => number): boolean {
  const head = concept.keys[0];
  const skipBigrams = Boolean(head && isCjkTerm(head) && head.length > 2);
  const present = (term: string, original: boolean) => {
    if (skipBigrams && original && isCjkTerm(term) && head && term.length < head.length) return false;
    return df(term) > 0;
  };
  if (concept.keys.some((term) => present(term, true))) return false;
  if (concept.original.some((term) => present(term, true))) return false;
  return !concept.terms.some((term) => !concept.original.includes(term) && present(term, false));
}

/** Abstain when no RDK-specific concept in the query occurs in these manuals. */
function hasNonBoardDomain(concept: Concept, df: (term: string) => number): boolean {
  const head = concept.keys[0];
  const skipBigrams = Boolean(head && isCjkTerm(head) && head.length > 2);
  const ok = (term: string, original: boolean) => {
    if (BOARD_TOKEN.has(term)) return false;
    if (skipBigrams && original && isCjkTerm(term) && head && term.length < head.length) return false;
    return isDomainTerm(term, df(term));
  };
  if (concept.keys.some((term) => ok(term, true))) return true;
  if (concept.original.some((term) => ok(term, true))) return true;
  return concept.terms.some((term) => !concept.original.includes(term) && ok(term, false));
}

function missingCodeToken(concepts: Concept[], df: (term: string) => number, n: number): boolean {
  if (concepts.length === 0) return false;
  const domain = concepts.some((concept) => conceptDomain(concept, df, n));
  const topical = concepts.some((concept) => hasNonBoardDomain(concept, df));
  // An unknown package or command is not answered by a board name or by
  // generic words (docker, login, install) that happen to occur.
  const absentCode = concepts.some(
    (concept) => conceptAbsent(concept, df) && concept.original.some((term) => isCodeLike(term)),
  );
  if (absentCode && !topical) return true;
  if (domain) return false;
  return concepts.some((concept) => conceptAbsent(concept, df));
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

function cloneConcepts(concepts: Concept[]): Concept[] {
  return concepts.map((concept) => ({
    terms: [...concept.terms],
    keys: [...concept.keys],
    original: [...concept.original],
    minHits: concept.minHits,
  }));
}

function bumpTerm(plan: { terms: QTerm[] }, term: string, qtf: number): void {
  if (term.length < 2 || EN_STOP.has(term)) return;
  const prev = plan.terms.find((item) => item.term === term);
  if (!prev) plan.terms.push({ term, qtf });
  else if (qtf > prev.qtf) prev.qtf = qtf;
}

function conceptFromTerm(term: string): Concept {
  const terms = [term];
  const extras = synonymExtras(term);
  if (extras) {
    for (const extra of extras) {
      for (const piece of aliasTerms(extra)) {
        if (!terms.includes(piece)) terms.push(piece);
      }
    }
  }
  return { terms, keys: [term], minHits: 1, original: [term] };
}

/** A short CJK word is in the manuals when the word or each of its bigrams is. */
function cjkCovered(term: string, df: (term: string) => number, n: number): boolean {
  if (df(term) > 0) return true;
  if (!isCjkTerm(term) || term.length < 3 || term.length > 4) return false;
  const grams = bigrams(term);
  if (grams.length === 0 || grams.some((gram) => df(gram) <= 0)) return false;
  if (n < 200) return true;
  return grams.some((gram) => df(gram) / n < COMMON_DF);
}

/** An indexed word. Bigram coverage is not enough: a phantom would eat a longer real word. */
function realWord(part: string, df: (term: string) => number, n: number): boolean {
  if (CJK_FILLER.has(part) || isGeneralLanguage(part)) return false;
  const docs = df(part);
  if (docs <= 0) return false;
  if (n >= 200 && docs / n >= COMMON_DF) return false;
  if (part.length >= 3) return true;
  return n > 0 && docs / n < COMMON_DF;
}

/**
 * Forward max match against words that are actually indexed. Characters that
 * do not start such a word are skipped, so a bigram-only phantom ("板子系统")
 * cannot swallow a longer real word that starts inside it ("系统版本号").
 * A 3–4 character bigram-covered word fills a gap only when it fits before
 * the next real word ("摄像头" inside "摄像头插上").
 */
function longestReal(segment: string, at: number, df: (term: string) => number, n: number): string {
  const room = segment.length - at;
  const max = Math.min(8, room);
  for (let len = max; len >= 2; len -= 1) {
    const piece = segment.slice(at, at + len);
    if (realWord(piece, df, n)) return piece;
  }
  return "";
}

function maxMatchParts(segment: string, df: (term: string) => number, n: number): string[] {
  const real: Array<{ start: number; word: string }> = [];
  let i = 0;
  while (i < segment.length) {
    const here = longestReal(segment, i, df, n);
    let best = here;
    let bestAt = here ? i : -1;
    // A short word must not hide a longer word that starts a character or two later
    // ("子系统" vs "系统版本号").
    for (let skip = 1; skip <= 2 && i + skip < segment.length; skip += 1) {
      const ahead = longestReal(segment, i + skip, df, n);
      if (!ahead) continue;
      if (ahead.length < (best?.length ?? 0) + 2) continue;
      best = ahead;
      bestAt = i + skip;
    }
    if (!best || bestAt < 0) {
      i += 1;
      continue;
    }
    real.push({ start: bestAt, word: best });
    i = bestAt + best.length;
  }
  const parts: string[] = [];
  let cursor = 0;
  const pushCovered = (from: number, to: number) => {
    let j = from;
    while (j < to) {
      let taken = "";
      const coverMax = Math.min(4, to - j);
      for (let len = coverMax; len >= 3; len -= 1) {
        const piece = segment.slice(j, j + len);
        if (CJK_FILLER.has(piece) || isGeneralLanguage(piece)) continue;
        if (!cjkCovered(piece, df, n)) continue;
        taken = piece;
        break;
      }
      if (!taken) {
        j += 1;
        continue;
      }
      parts.push(taken);
      j += taken.length;
    }
  };
  for (const item of real) {
    if (item.start > cursor) pushCovered(cursor, item.start);
    parts.push(item.word);
    cursor = item.start + item.word.length;
  }
  if (cursor < segment.length) pushCovered(cursor, segment.length);
  return parts;
}

/**
 * Split CJK that was glued past a real word ("摄像头插上") and, when an
 * underscored identifier is missing, accept a slightly shorter corpus stem.
 */
function adaptPlan(
  plan: { terms: QTerm[]; concepts: Concept[] },
  query: string,
  df: (term: string) => number,
  n: number,
): void {
  if (!ablate("segment")) {
    const next: Concept[] = [];
    for (const concept of plan.concepts) {
      const head = concept.keys[0] ?? "";
      if (!isCjkTerm(head) || head.length <= 2 || df(head) > 0) {
        next.push(concept);
        continue;
      }
      const parts = maxMatchParts(head, df, n);
      if (parts.length === 0) {
        next.push(concept);
        continue;
      }
      for (const part of parts) {
        const born = conceptFromTerm(part);
        next.push(born);
        // Short pieces ("镜像", "温度") must not outrank a heading that already
        // matches the query. A long in-corpus word ("系统版本号") keeps more weight.
        const ratio = head.length > 0 ? part.length / head.length : 0.5;
        // Only a long recovered word is allowed to move rank. Shorter pieces
        // stay in the concept list so a glued topic does not abstain.
        const qtf = part.length >= 5 ? Math.min(0.75, Math.max(0.5, ratio)) : 0.1;
        for (const term of born.terms) bumpTerm(plan, term, term === part ? qtf : qtf * 0.45);
      }
    }
    plan.concepts = next;
  }

  if (!ablate("identifier")) {
    for (const match of query.matchAll(/[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*/g)) {
      const full = match[0].toLowerCase();
      const parts = match[0]
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/\s+/)
        .filter((part) => part.length >= 2);
      const owner = plan.concepts.find((concept) => concept.original.includes(full) || concept.keys.includes(full));
      for (const part of parts) {
        if (df(part) <= 0 && df(full) > 0) continue;
        bumpTerm(plan, part, 0.55);
        if (owner && !owner.terms.includes(part)) owner.terms.push(part);
      }
    }
    const have = new Set(plan.terms.map((item) => item.term));
    for (const concept of plan.concepts) {
      for (const term of [...concept.original]) {
        if (df(term) > 0 || term.length < 8) continue;
        if (!term.includes("_") && !term.includes(".")) continue;
        for (let drop = 1; drop <= 4 && term.length - drop >= 6; drop += 1) {
          const prefix = term.slice(0, term.length - drop);
          const docs = df(prefix);
          if (docs <= 0 || (n > 0 && docs / n > 0.05)) continue;
          if (!prefix.includes("_") && !prefix.includes(".")) continue;
          rememberTerm(concept, plan.terms, have, prefix, 0.75);
          break;
        }
      }
    }
  }
}

function phraseNeedles(query: string): string[] {
  if (ablate("phrase")) return [];
  const needles: string[] = [];
  const lower = query.toLowerCase();
  for (const match of lower.matchAll(/[`"'“”‘’]([^`"'“”‘’]{6,})[`"'“”‘’]/g)) {
    const text = match[1]?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length >= 6) needles.push(text);
  }
  if (/error|exception|failed|errno|traceback|invalid|not available|no such|报错/i.test(query)) {
    for (const match of lower.matchAll(/[a-z][a-z0-9_./:-]{2,}(?:\s+[a-z0-9_./:-]+){2,}/g)) {
      const text = match[0].replace(/\s+/g, " ").trim();
      if (text.length >= 12) needles.push(text);
    }
  }
  return [...new Set(needles)].slice(0, 4);
}

function phraseScale(doc: IndexedDoc, needles: string[]): number {
  if (needles.length === 0) return 1;
  const hay = `${doc.title}\n${(doc.text ?? "").slice(0, SCAN_CAP)}\n${(doc.snippet ?? "").slice(0, SCAN_CAP)}\n${(doc.answer ?? "").slice(0, SCAN_CAP)}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  let hit = 0;
  for (const needle of needles) {
    if (hay.includes(needle)) hit += 1;
  }
  if (hit === 0) return 1;
  return Math.min(1.7, 1.28 + 0.14 * (hit - 1));
}

function boardScale(doc: IndexedDoc, query: string, options: RankOptions): number {
  if (ablate("board")) return 1;
  const named = mentionedBoards(query);
  // No boost for the matching board. A positive lift let an X5 URL beat the
  // page whose title actually answers the question.
  const boards = named.length > 0 ? named : options.board ? [options.board] : [];
  if (boards.length === 0) return 1;
  const on = boardsOn(doc);
  if (on.length === 0 || on.some((board) => boards.includes(board))) return 1;
  // Mild, and stronger only when the query itself names a board. A board
  // passed only as an option must not bury a canonical page.
  return named.length > 0 ? 0.85 : 0.92;
}

function roleScale(doc: IndexedDoc): number {
  return ablate("structure") ? 1 : structureScale(doc);
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
  const filled = doc.snippet || doc.answer?.slice(0, 180) || doc.text?.slice(0, 180) || crumbs || "";
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
  // Abstain on the query as written. Segmentation may add an in-corpus word
  // for ranking, but that must not hide an unknown command such as iphone.
  const abstainConcepts = cloneConcepts(plan.concepts);

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
  const dfAbstain = (term: string) => dfOutsideAnswers(corpora, term);
  const abstainTerms = plan.terms.map((item) => ({ ...item }));
  adaptPlan(plan, query, df, n);
  if (!ablate("typo")) {
    addTypoVariants(plan.concepts, plan.terms, df);
    addTypoVariants(abstainConcepts, abstainTerms, dfAbstain);
  }
  if (!ablate("prefix")) {
    expandPrefixes(plan.concepts, plan.terms, corpora);
    expandPrefixes(abstainConcepts, abstainTerms, corpora, dfAbstain);
  }
  // When the full identifier is absent (hbm_shell) its documented alias
  // should carry the query, not the leftover fragment (hbm) at qtf 0.2.
  for (const concept of plan.concepts) {
    const head = concept.keys[0];
    if (!head || df(head) > 0) continue;
    if (!concept.original.some((term) => isCodeLike(term) || term.includes("_"))) continue;
    for (const item of plan.terms) {
      if (concept.original.includes(item.term)) continue;
      if (!concept.terms.includes(item.term)) continue;
      if (item.qtf < 0.85) item.qtf = 0.85;
    }
  }
  const lexical = prepareLexical(query);
  const needles = phraseNeedles(query);
  const commonTitle = new Set<string>();
  if (!ablate("titledf") && n >= 800) {
    for (const qterm of plan.terms) {
      const docsWith = df(qterm.term);
      if (docsWith > 0 && docsWith / n >= COMMON_DF) commonTitle.add(qterm.term);
    }
  }

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
  // A high-df bigram such as 连接 fills the head of the list. Keep enough of
  // the tail that a page which actually contains the rare token (WiFi on the
  // remote-login page) is still scored.
  const pool = cands.slice(0, ablate("pool") ? 300 : 450);
  const distinctive = distinctiveOf(plan.concepts, df, n);
  for (const cand of pool) {
    const doc = cand.corpus.docs[cand.doc];
    const landing =
      !ablate("landing") && isThinLanding(doc) && plan.concepts.some((concept) => conceptDomain(concept, df, n)) ? 0.34 : 1;
    cand.raw =
      cand.score *
      breadthScale(doc, cand.corpus.bodyDl[cand.doc], avgBody) *
      roleScale(doc) *
      landing *
      boardScale(doc, query, options) *
      phraseScale(doc, needles);
    cand.coverage = coverageOf(cand.corpus, cand.doc, abstainConcepts, df, n);
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

  // Reciprocal-rank fusion with the title/URL lexical score. BM25 rank stays
  // the rare-token signal; lexical rank promotes the page whose title or
  // manual section actually answers a how-to.
  const lexOf = new Map<(typeof pool)[number], number>();
  for (const cand of pool) lexOf.set(cand, lexicalScore(cand.corpus.docs[cand.doc], lexical, commonTitle));
  const byLex = [...pool].sort((a, b) => (lexOf.get(b) ?? 0) - (lexOf.get(a) ?? 0) || a.doc - b.doc);
  const lexRank = new Map<(typeof pool)[number], number>();
  byLex.forEach((cand, index) => lexRank.set(cand, index));
  if (!ablate("fusion")) {
    for (let index = 0; index < pool.length; index += 1) {
      const cand = pool[index];
      if (!cand) continue;
      const lexicalRank = lexRank.get(cand) ?? index;
      cand.score = fuseRanks(index, lexicalRank);
    }
    pool.sort((a, b) => b.score - a.score || a.doc - b.doc);
  }

  // Page score starts at the best chunk. Each extra chunk adds
  // 0.3 × min(best, that chunk) / chunks_already_merged, so the second
  // chunk contributes 0.3× and later chunks a smaller share.
  // Weight 0.3 was selected on train. RDK_ABLATE=page_agg keeps max-only.
  const PAGE_SECOND_WEIGHT = 0.3;
  const best = new Map<string, { hit: SearchHit; page: boolean; doc: IndexedDoc; best: number; n: number }>();
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
      best.set(base, { hit, page: doc.kind === "page", doc, best: hit.score, n: 1 });
      continue;
    }
    const nextIsPage = doc.kind === "page";
    const raw = hit.score;
    const top = Math.max(prev.best, raw);
    const winnerIsNew = raw > prev.best;
    const winner = winnerIsNew ? hit : prev.hit;
    const snippet = winnerIsNew ? hit.snippet : prev.hit.snippet;
    const url = winnerIsNew ? hit.url : prev.hit.url;
    const coverageOut = winnerIsNew ? hit.coverage : prev.hit.coverage;
    const confidenceOut = winnerIsNew ? hit.confidence : prev.hit.confidence;
    const winnerDoc = winnerIsNew ? doc : prev.doc;
    const running = Math.max(raw, prev.hit.score);
    const pageScore = ablate("page_agg")
      ? top
      : running + (PAGE_SECOND_WEIGHT * Math.min(raw, prev.hit.score)) / prev.n;
    // The chunk that won keeps its title. A lower-scoring page must not
    // replace a question heading with the section name.
    const title = winner.title;
    best.set(base, {
      hit: {
        ...winner,
        title,
        snippet: snippet || hit.snippet || prev.hit.snippet,
        url,
        score: pageScore,
        coverage: coverageOut,
        confidence: confidenceOut,
        quality: "good",
      },
      page: prev.page || nextIsPage,
      doc: winnerDoc,
      best: top,
      n: prev.n + 1,
    });
  }

  const ranked = [...best.values()].sort((a, b) => b.hit.score - a.hit.score || a.hit.url.localeCompare(b.hit.url));
  // Refusal uses the query before segmentation, and ignores tokens that
  // occur only in an FAQ answer. A glued phrase must not become in-corpus
  // just because one piece of it is.
  if (!ablate("oos") && missingCodeToken(abstainConcepts, dfAbstain, n)) {
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
