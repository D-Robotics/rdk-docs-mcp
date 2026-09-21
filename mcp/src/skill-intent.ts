/**
 * Query-level task-intent analysis for skill search (retest 2026-09-21 P1).
 *
 * The ranking layer used to treat every quantization word as "the user wants
 * to run quantization", so "现成的量化好的模型直接用" (find me an already
 * quantized model) was pushed into PTQ/QAT disambiguation and away from the
 * Model Zoo. This module classifies the *task* first — consuming a ready-made
 * model vs. executing quantization vs. something else — and only then lets the
 * PTQ/QAT guardrails apply to queries that actually ask to quantize.
 *
 * All rules are phrase-based on the raw query with negation spans, mirroring
 * the catalog's own wording (rdk-skills @ 08d0a46). No LLM, no network, no
 * hand-maintained skill-name whitelist.
 */

export type QuantPath = "ptq" | "qat";

export type TaskIntent = "ready_model" | "quantize" | "other";

export type IntentAnalysis = {
  intent: TaskIntent;
  /** The quantization path the query commits to, or null while undecided/both. */
  decidedQuantPath: QuantPath | null;
  /**
   * True when the query affirmatively asks for both a ready-made model and a
   * self-run quantization without deciding between them — clarify, don't guess.
   */
  mixedModelAsk: boolean;
  /** Concept tokens bridging the intent to catalog vocabulary (e.g. model, zoo). */
  conceptTokens: string[];
  /** True when every occurrence of the token sits inside a negated span. */
  isNegatedToken: (token: string) => boolean;
};

// ---------------------------------------------------------------------------
// Negation spans: "不要现成模型" / "not PTQ" negate the word or CJK run that
// follows the cue, up to the next separator. Tokens whose every occurrence is
// negated are dropped from the matcher set; phrase cues inside a span never
// count as affirmative evidence.
// ---------------------------------------------------------------------------

const NEGATION_CUE =
  /(?:不用|不要|不想|不是|不选|不做|不把|排除|拒绝|非|没有|无法|别|除外|not|no|without|except|rather than|excluding|don't|dont|isn't|isnt)(?:[\s:：,，、]*|$)/gi;

function negationSpans(lowered: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const match of lowered.matchAll(NEGATION_CUE)) {
    const start = (match.index ?? 0) + match[0].length;
    // The negated unit is one ascii word or one CJK run, never crossing
    // punctuation, so "not PTQ: X5 QAT" only negates PTQ.
    const rest = lowered.slice(start, start + 24);
    const word = /^(?:[a-z0-9_.-]+|[一-鿿]+)/.exec(rest)?.[0];
    if (word) spans.push([start, start + word.length]);
  }
  return spans;
}

function inSpans(spans: Array<[number, number]>, index: number, length: number): boolean {
  return spans.some(([from, to]) => index >= from && index + length <= to);
}

function occurrences(lowered: string, needle: string): Array<[index: number, length: number]> {
  const hits: Array<[number, number]> = [];
  if (!needle) return hits;
  for (let i = lowered.indexOf(needle); i !== -1; i = lowered.indexOf(needle, i + 1)) {
    hits.push([i, needle.length]);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Task-phrase tables. `covers` marks the base signal a phrase consumes so the
// bare word inside it stops looking like the opposite task: 量化好/已量化 are
// ready-model evidence, not a quantization ask; 预训练 is model shopping, not
// a QAT training decision.
// ---------------------------------------------------------------------------

type TaskPhrase = { text: string; covers?: "quant" | "training" };

const READY_PHRASES: TaskPhrase[] = [
  { text: "量化好", covers: "quant" },
  { text: "已量化", covers: "quant" },
  { text: "量化完成", covers: "quant" },
  { text: "量化过的", covers: "quant" },
  { text: "现成" },
  { text: "开箱即用" },
  { text: "模型库" },
  { text: "model zoo" },
  { text: "预训练", covers: "training" },
  { text: "pretrained" },
  { text: "ready-made" },
  { text: "ready to use" },
  { text: "直接用" },
];

/** Affirmative "quantize it myself / for me" phrasing (longest first). */
const QUANT_TASK_PHRASES = [
  "自己量化",
  "手动量化",
  "我要量化",
  "想量化",
  "需要量化",
  "帮我量化",
  "执行量化",
  "进行量化",
  "做量化",
  "量化后",
  "quantize",
  "quantization",
  "quantizing",
];

/** The 把/将…量化 construction ("把模型量化后部署") is a quantization ask. */
const QUANT_COMPOUND = /[把将][^，。,;.!?？]{0,16}量化/g;

/**
 * Maintainer workflow wording. When present, catalog/consumption phrasing does
 * not classify the query as ready-model shopping (e.g. "模型库 发版流程" is a
 * release workflow, not model lookup).
 */
const MAINTAINER_CUE =
  /开发样例|新增模型|修复样例|样例开发|样例审计|代码评审|模型发版|发版|pr review|repository development|sample development|adding or modifying/gi;

export function analyzeIntent(query: string): IntentAnalysis {
  const lowered = query.trim().toLowerCase();
  const spans = negationSpans(lowered);
  const isNegatedToken = (token: string) => {
    const hits = occurrences(lowered, token);
    return hits.length > 0 && hits.every(([index, length]) => inSpans(spans, index, length));
  };

  // Signal coverage: spans of quant/training words consumed by a task phrase,
  // so a bare-word scan can skip them.
  const coveredQuant: Array<[number, number]> = [];
  const coveredTraining: Array<[number, number]> = [];
  const coveredBy = (needle: string): Array<[number, number]> => occurrences(lowered, needle);

  let readyCues = 0;
  for (const phrase of READY_PHRASES) {
    for (const [index, length] of coveredBy(phrase.text)) {
      if (phrase.covers === "quant") coveredQuant.push([index, index + length]);
      if (phrase.covers === "training") coveredTraining.push([index, index + length]);
      if (!inSpans(spans, index, length)) readyCues += 1;
    }
  }

  const quantCovered = (index: number, length: number) =>
    coveredQuant.some(([from, to]) => index >= from && index + length <= to);
  const trainingCovered = (index: number, length: number) =>
    coveredTraining.some(([from, to]) => index >= from && index + length <= to);

  let quantizeCues = 0;
  for (const text of QUANT_TASK_PHRASES) {
    for (const [index, length] of coveredBy(text)) {
      // An English task word also covers the bare quant token it contains.
      if (/^quant/.test(text)) coveredQuant.push([index, index + length]);
      if (!inSpans(spans, index, length)) quantizeCues += 1;
    }
  }
  for (const match of lowered.matchAll(QUANT_COMPOUND)) {
    const index = match.index ?? 0;
    coveredQuant.push([index, index + match[0].length]);
    if (!inSpans(spans, index, match[0].length)) quantizeCues += 1;
  }
  // Any bare 量化 that no phrase consumed is still an affirmative quantization
  // ask unless the whole occurrence is negated ("不量化").
  for (const [index, length] of coveredBy("量化")) {
    if (quantCovered(index, length)) continue;
    coveredQuant.push([index, index + length]);
    if (!inSpans(spans, index, length)) quantizeCues += 1;
  }

  const maintainerCue = [...lowered.matchAll(MAINTAINER_CUE)].some(
    (match) => !inSpans(spans, match.index ?? 0, match[0].length),
  );
  const mixedModelAsk = readyCues > 0 && quantizeCues > 0;

  let intent: TaskIntent;
  if (quantizeCues > 0) intent = "quantize";
  else if (readyCues > 0 && !maintainerCue) intent = "ready_model";
  else intent = "other";

  return {
    intent,
    decidedQuantPath: decidedQuantPath(lowered, spans, trainingCovered),
    mixedModelAsk,
    conceptTokens: intent === "ready_model" ? ["model", "zoo"] : [],
    isNegatedToken,
  };
}

// ---------------------------------------------------------------------------
// The PTQ/QAT decision implied by the query itself. A signal only counts when
// it is actually asserted: "不用 QAT，直接 PTQ" commits to PTQ; "not PTQ"
// commits to neither side of that mention; "PTQ 和 QAT 区别" mentions both and
// decides neither; 预训练 does not make 训练 a QAT decision.
// ---------------------------------------------------------------------------

const SIGNAL_NEGATION_BEFORE =
  /(?:不用|不要|不是|不选|不做|不把|排除|拒绝|非|没有|无法)\s*$|(?:^|[\s(（,，、/])(?:not|no|without|except|rather than|excluding)[\s:-]*$/i;
const SIGNAL_NEGATION_AFTER = /^\s*(?:除外|就不要|就不用|不行)/;

function hasEffectiveSignal(
  lowered: string,
  signal: string,
  spans: Array<[number, number]>,
  isCovered?: (index: number, length: number) => boolean,
): boolean {
  for (const [index, length] of occurrences(lowered, signal)) {
    if (isCovered?.(index, length)) continue;
    if (inSpans(spans, index, length)) continue;
    const before = lowered.slice(Math.max(0, index - 16), index);
    const after = lowered.slice(index + signal.length, index + signal.length + 6);
    if (!SIGNAL_NEGATION_BEFORE.test(before) && !SIGNAL_NEGATION_AFTER.test(after)) return true;
  }
  return false;
}

function decidedQuantPath(
  lowered: string,
  spans: Array<[number, number]>,
  trainingCovered: (index: number, length: number) => boolean,
): QuantPath | null {
  const ptq = hasEffectiveSignal(lowered, "ptq", spans);
  const qat =
    hasEffectiveSignal(lowered, "qat", spans) ||
    hasEffectiveSignal(lowered, "训练", spans, trainingCovered) ||
    hasEffectiveSignal(lowered, "training", spans, trainingCovered);
  if (ptq && !qat) return "ptq";
  if (qat && !ptq) return "qat";
  return null;
}
