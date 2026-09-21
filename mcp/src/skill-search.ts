import { mentionedBoards, type BoardId } from "./products.js";
import type { InstallType, SkillRecord } from "./skill-catalog.js";

/**
 * Pure ranking for the rdk-skills catalog (issue #4 §5). Nothing here talks to
 * the network or reads user state; every result comes from the validated
 * snapshot passed in. The rules deliberately differ from doc search: task
 * words must decide relevance, model words alone never promote a workflow,
 * and quantization queries without a PTQ/QAT decision are disambiguated
 * instead of guessed.
 */

export type SearchFilters = {
  pack?: string;
  platform?: string;
  installType?: InstallType;
  limit?: number;
};

export type RankedSkill = {
  skill: SkillRecord;
  score: number;
  matched_terms: string[];
  match_reason: string;
};

export type GuidanceKind = "default" | "model_only" | "ambiguous_quant" | "no_match" | "invalid_input";

export type SkillSearchOutcome = {
  matches: RankedSkill[];
  guidance: string;
  guidance_kind: GuidanceKind;
};

// ---------------------------------------------------------------------------
// Tokenization: lowercase ASCII words, joined digit+letter names ("40 pin" ->
// "40pin"), Chinese bigrams without question filler, plus a small task-word
// synonym bridge so Chinese queries match English descriptions.
// ---------------------------------------------------------------------------

const CJK_STOPWORDS = [
  "怎么样", "怎么", "怎样", "如何", "什么", "哪些", "哪里", "是否", "多少",
  "请问", "帮我", "一下", "可不可以", "能不能", "有没有", "找一下", "找个",
];

const CJK_STOP_CHARS = new Set(["的", "了", "吗", "呢", "啊", "吧", "把", "是", "有", "个", "和", "或", "在", "给", "去", "到", "用", "要"]);

const CJK_RUN = /[一-鿿]+/g;

function cjkBigrams(text: string): string[] {
  const grams: string[] = [];
  for (const match of text.matchAll(CJK_RUN)) {
    let run = match[0];
    for (const stop of CJK_STOPWORDS) run = run.replaceAll(stop, " ");
    run = [...run].map((ch) => (CJK_STOP_CHARS.has(ch) ? " " : ch)).join("");
    for (const segment of run.split(" ")) {
      if (segment.length < 2) continue;
      for (let i = 0; i + 2 <= segment.length; i += 1) grams.push(segment.slice(i, i + 2));
    }
  }
  return grams;
}

/** Collapse morphological variants onto one task stem. */
function normalizeToken(token: string): string {
  if (/^quant[a-z]*/.test(token)) return "quant";
  if (/^deploy[a-z]*/.test(token)) return "deploy";
  if (/^diagno[a-z]*/.test(token)) return "diagnostic";
  if (/^train[a-z]*/.test(token)) return "training";
  if (/^calibrat[a-z]*/.test(token)) return "calibration";
  return token;
}

const TASK_SYNONYMS: Record<string, string[]> = {
  量化: ["quant"],
  部署: ["deploy"],
  编译: ["compile"],
  训练: ["training"],
  精度: ["accuracy"],
  性能: ["performance"],
  诊断: ["diagnostic"],
  环境: ["environment"],
  板卡: ["board"],
};

/** Board/brand words narrow by platform; they never count as the task itself. */
const MODEL_WORDS = new Set([
  "x3", "x5", "s100", "s100p", "s600", "ultra", "rdk", "tros", "oe", "j6",
  "bayes", "bayes-e", "horizon", "d-robotics",
]);

export function skillQueryTokens(query: string): string[] {
  const seen = new Set<string>();
  const lowered = query.trim().toLowerCase();
  const add = (token: string) => {
    const normalized = normalizeToken(token);
    if (normalized) seen.add(normalized);
  };
  for (const match of lowered.matchAll(/[a-z][a-z0-9_.-]*|\d+[a-z][a-z0-9_.-]*|\d+/g)) add(match[0]);
  // "40 pin" / "40-PIN" must also match the joined "40pin" used in names.
  for (const match of lowered.matchAll(/(\d+)[\s-]+([a-z][a-z0-9_.-]*)/g)) add(`${match[1]}${match[2]}`);
  for (const gram of cjkBigrams(lowered)) add(gram);
  for (const token of [...seen]) {
    for (const extra of TASK_SYNONYMS[token] ?? []) seen.add(normalizeToken(extra));
  }
  return [...seen].filter((token) => !/^\d+$/.test(token));
}

type Matcher = { token: string; test: (text: string) => boolean };

function buildMatcher(token: string): Matcher {
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(token)) {
    return { token, test: (text) => text.includes(token) };
  }
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Short ascii tokens stand alone against letters; longer ones may extend to
  // the right so "quant" matches "quantized" (mirrors doc-search behavior).
  const pattern =
    token.length <= 3
      ? new RegExp(`(?<![a-z])${escaped}(?![a-z])`)
      : new RegExp(`(?<![a-z0-9])${escaped}`);
  return { token, test: (text) => pattern.test(text) };
}

// ---------------------------------------------------------------------------
// Negation-aware description matching: a token that only appears inside a
// "Do not use for … / 拒绝…" sentence is not evidence of relevance.
// ---------------------------------------------------------------------------

const NEGATION_CUES =
  /拒绝|不处理|不支持|不接受|不使用|不执行|不把|不要|不用于|不是用于|排除|不自动|\bnot\b|do not|don't/i;

function splitSentences(description: string): string[] {
  return description
    .split(/(?:[。；;！?？\n]|(?<=\.)\s+)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

type DescriptionMatcher = (token: string) => boolean;

function descriptionMatcher(description: string): DescriptionMatcher {
  const sentences = splitSentences(description);
  const positive = sentences.filter((sentence) => !NEGATION_CUES.test(sentence));
  const haystack = positive.join("\n");
  return (token: string) => buildMatcher(token).test(haystack);
}

// ---------------------------------------------------------------------------
// Classification of the query and of catalog records. The classification is
// token-based on purpose: no hand-maintained skill-name whitelist (spec §5).
// ---------------------------------------------------------------------------

const QUANT_TOKENS = new Set(["量化", "quant"]);

function isQuantToken(token: string): boolean {
  return QUANT_TOKENS.has(token);
}

// ---------------------------------------------------------------------------
// The PTQ/QAT decision implied by the query itself. A signal is only counted
// when it is actually asserted: "不用 QAT，直接 PTQ" commits to PTQ, "not PTQ"
// does not commit to PTQ, and a question mentioning both paths ("PTQ 和 QAT
// 区别") commits to neither, so no mutual exclusion is applied.
// ---------------------------------------------------------------------------

type QuantPath = "ptq" | "qat";

/** Negation cues that may sit immediately before a signal ("非/不用/not …"). */
const QUERY_NEGATION_BEFORE =
  /(?:不用|不要|不是|不选|不做|排除|拒绝|非|没有|无法)\s*$|(?:^|[\s(（,，、/])(?:not|no|without|except|rather than|excluding)[\s:-]*$/i;
/** Cues that negate the signal from the right ("QAT 除外"). */
const QUERY_NEGATION_AFTER = /^\s*(?:除外|就不要|就不用|不行)/;

function hasEffectiveSignal(lowered: string, signal: string): boolean {
  for (let index = lowered.indexOf(signal); index !== -1; index = lowered.indexOf(signal, index + 1)) {
    const before = lowered.slice(Math.max(0, index - 16), index);
    const after = lowered.slice(index + signal.length, index + signal.length + 6);
    if (!QUERY_NEGATION_BEFORE.test(before) && !QUERY_NEGATION_AFTER.test(after)) return true;
  }
  return false;
}

/** The quantization path the query commits to, or null when undecided/both. */
function decidedQuantPath(query: string): QuantPath | null {
  const lowered = query.trim().toLowerCase();
  const ptq = hasEffectiveSignal(lowered, "ptq");
  const qat = ["qat", "训练", "training"].some((signal) => hasEffectiveSignal(lowered, signal));
  if (ptq && !qat) return "ptq";
  if (qat && !ptq) return "qat";
  return null;
}

function isEntrySkill(skill: SkillRecord): boolean {
  const name = skill.name.toLowerCase();
  if (/(^|-)router(-|$)/.test(name)) return true;
  const sentences = splitSentences(skill.description);
  return sentences.some(
    (sentence) => !NEGATION_CUES.test(sentence) && (sentence.includes("路由") || sentence.includes("入口")),
  );
}

function isOrchestratorSkill(skill: SkillRecord): boolean {
  if (/(^|-)deploy(-|$)/.test(skill.name.toLowerCase())) return true;
  return splitSentences(skill.description).some(
    (sentence) => !NEGATION_CUES.test(sentence) && (sentence.includes("编排") || /orchestrat/i.test(sentence)),
  );
}

/** Which quantization path a record is dedicated to (token rule on the name). */
function quantPathOf(skill: SkillRecord): QuantPath | null {
  const name = skill.name.toLowerCase();
  if (/(^|[-_])ptq([-_]|$)/.test(name)) return "ptq";
  if (/(^|[-_])qat([-_]|$)/.test(name)) return "qat";
  return null;
}

// ---------------------------------------------------------------------------
// Platform filter: a known board keeps board-agnostic skills and skills that
// mention that board, and drops skills scoped to a different board only.
// ---------------------------------------------------------------------------

function boardsInText(text: string): BoardId[] {
  return mentionedBoards(text);
}

function passesPlatformFilter(skill: SkillRecord, platform: string): boolean {
  const platformBoards = boardsInText(platform.toLowerCase());
  if (platformBoards.length === 0) {
    // Unknown platform string: require every token to appear in the text.
    const text = `${skill.name} ${skill.description} ${skill.pack}`.toLowerCase();
    return skillQueryTokens(platform).every((token) => buildMatcher(token).test(text));
  }
  const mentioned = boardsInText(`${skill.name} ${skill.description} ${skill.pack}`);
  if (mentioned.length === 0) return true; // board-agnostic skills stay
  return platformBoards.some((board) => mentioned.includes(board));
}

// ---------------------------------------------------------------------------
// Scoring.
// ---------------------------------------------------------------------------

const EXACT_NAME_SCORE = 1000;
const TASK_WEIGHTS = { name: 12, path: 7, pack: 3, description: 2 };
const MODEL_WEIGHTS = { name: 4, path: 3, description: 1 };
const COVERAGE_BONUS = 10;
const ALIGNED_MODEL_BONUS = 3;
const ORCHESTRATOR_BONUS = 6;
/** While PTQ/QAT is undecided, entry skills lead and generic word matches fade. */
const AMBIGUOUS_ENTRY_BOOST = 20;
const AMBIGUOUS_OTHER_ENTRY_BOOST = 8;
const AMBIGUOUS_GENERIC_FACTOR = 0.5;

type FieldHits = { name: string[]; path: string[]; pack: string[]; description: string[] };

function matchReason(hits: FieldHits, exact: boolean): string {
  const parts: string[] = [];
  if (exact) parts.push("exact name match");
  for (const [field, tokens] of Object.entries(hits)) {
    if (tokens.length === 0) continue;
    parts.push(`${field}: ${[...new Set(tokens)].sort().join(", ")}`);
  }
  return parts.join("; ");
}

function scoreSkill(
  skill: SkillRecord,
  taskMatchers: Matcher[],
  modelMatchers: Matcher[],
  exactName: boolean,
  ambiguousQuant: boolean,
): { score: number; hits: FieldHits; matchedTask: number; matchedModel: number; quantMatched: boolean } {
  const name = skill.name.toLowerCase();
  const path = skill.catalog_path.toLowerCase();
  const pack = skill.pack.toLowerCase();
  const descriptionMatches = descriptionMatcher(skill.description);

  const hits: FieldHits = { name: [], path: [], pack: [], description: [] };
  let score = exactName ? EXACT_NAME_SCORE : 0;
  let matchedTask = 0;
  let quantMatched = false;

  for (const { token, test } of taskMatchers) {
    let hit = false;
    if (test(name)) {
      score += TASK_WEIGHTS.name;
      hits.name.push(token);
      hit = true;
    }
    if (test(path)) {
      score += TASK_WEIGHTS.path;
      hits.path.push(token);
      hit = true;
    }
    if (test(pack)) {
      score += TASK_WEIGHTS.pack;
      hits.pack.push(token);
      hit = true;
    }
    if (descriptionMatches(token)) {
      score += TASK_WEIGHTS.description;
      hits.description.push(token);
      hit = true;
      if (isQuantToken(token)) quantMatched = true;
    }
    if (test(name) || test(path)) {
      if (isQuantToken(token)) quantMatched = true;
    }
    if (hit) matchedTask += 1;
  }

  let matchedModel = 0;
  for (const { token, test } of modelMatchers) {
    let hit = false;
    if (test(name)) {
      score += MODEL_WEIGHTS.name;
      hit = true;
    }
    if (test(path)) {
      score += MODEL_WEIGHTS.path;
      hit = true;
    }
    if (descriptionMatches(token)) {
      score += MODEL_WEIGHTS.description;
      hit = true;
    }
    if (hit) {
      matchedModel += 1;
      hits.name.push(token);
    }
  }

  if (taskMatchers.length > 0) score += Math.round((matchedTask / taskMatchers.length) * COVERAGE_BONUS);
  const alignedModel = modelMatchers.length > 0 && matchedModel === modelMatchers.length;
  if (alignedModel) score += ALIGNED_MODEL_BONUS;
  if (isOrchestratorSkill(skill)) score += ORCHESTRATOR_BONUS;
  if (ambiguousQuant) {
    if (isEntrySkill(skill)) score += alignedModel ? AMBIGUOUS_ENTRY_BOOST : AMBIGUOUS_OTHER_ENTRY_BOOST;
    else if (!quantMatched) score = Math.round(score * AMBIGUOUS_GENERIC_FACTOR);
  }

  return { score, hits, matchedTask, matchedModel, quantMatched };
}

// ---------------------------------------------------------------------------
// Guidance text. Guidance is advisory prose; it never claims a catalog entry
// is installed or that a text match is a compatibility guarantee.
// ---------------------------------------------------------------------------

const GUIDANCE_TEXT: Record<GuidanceKind, string> = {
  default:
    "Matches come from the D-Robotics/rdk-skills catalog snapshot; presence in the catalog does not mean the skill is installed locally. Confirm the exact record with get_skill before recommending, keep to 1-2 recommendations, and only treat installation as authorized when the user explicitly asks.",
  model_only:
    "The query names only a board/model. These are catalog candidates matching that model, not compatibility claims and not a decided workflow. Ask the user for the concrete task (flashing, GPIO, camera, quantization, deployment, ...) before recommending a skill.",
  ambiguous_quant:
    "Quantization path is ambiguous: PTQ (post-training quantization, calibration on ready models) and QAT (quantization-aware training on trainable models) are different workflows. Ask the user which one they mean; an entry/router skill can triage further. Do not present a PTQ or QAT sub-step as the decided answer for this query.",
  no_match:
    "No skill in the catalog snapshot matched. Do not invent skill names or install commands; ask the user to rephrase with the concrete task, and fall back to official docs where applicable.",
  invalid_input:
    "The query has no usable search terms (only punctuation, numbers, or filler words). Do not recommend any skill from this input; ask the user to rephrase with the concrete task or board model.",
};

/**
 * Rank catalog skills for a query. Throws no errors for content reasons —
 * zero matches are a valid outcome with no_match guidance, and a query with
 * zero usable tokens is reported as invalid_input instead of matching
 * unrelated records through ranking bonuses.
 */
export function searchSkillRecords(skills: SkillRecord[], query: string, filters: SearchFilters = {}): SkillSearchOutcome {
  const tokens = skillQueryTokens(query);
  if (tokens.length === 0) {
    return { matches: [], guidance: GUIDANCE_TEXT.invalid_input, guidance_kind: "invalid_input" };
  }
  const taskMatchers = tokens.filter((token) => !MODEL_WORDS.has(token)).map(buildMatcher);
  const modelMatchers = tokens.filter((token) => MODEL_WORDS.has(token)).map(buildMatcher);
  // The PTQ/QAT path the query commits to; null while undecided (or when both
  // paths are mentioned, e.g. a comparison question).
  const decidedPath: QuantPath | null = decidedQuantPath(query);
  const ambiguousQuant = tokens.some(isQuantToken) && decidedPath === null;

  const pool = skills.filter((skill) => {
    if (filters.installType && skill.install_type !== filters.installType) return false;
    if (filters.pack && skill.pack.toLowerCase() !== filters.pack.trim().toLowerCase()) return false;
    if (filters.platform && !passesPlatformFilter(skill, filters.platform)) return false;
    return true;
  });

  const matches: RankedSkill[] = [];
  for (const skill of pool) {
    const exactName = query.trim().toLowerCase() === skill.name.toLowerCase();
    const { score, hits, matchedTask, matchedModel, quantMatched } = scoreSkill(
      skill,
      taskMatchers,
      modelMatchers,
      exactName,
      ambiguousQuant,
    );

    let included = true;
    if (taskMatchers.length > 0 && matchedTask === 0) {
      // Model-only matches are noise for a task query — except that an entry
      // skill may still triage an ambiguous quantization request.
      const rescuedEntry = ambiguousQuant && isEntrySkill(skill) && matchedModel > 0;
      included = rescuedEntry;
    }
    if (included && taskMatchers.length === 0 && modelMatchers.length > 0 && matchedModel === 0) {
      // A model-only query must genuinely match the model; ranking bonuses
      // (e.g. the orchestrator bonus) never qualify a record on their own.
      included = false;
    }
    if (included && ambiguousQuant && quantMatched && !isEntrySkill(skill)) {
      // A sub-step that merely mentions quantization must not become the
      // decided answer while the PTQ/QAT choice is open.
      included = false;
    }
    if (included && ambiguousQuant && quantPathOf(skill) !== null) {
      // Same for skills that are themselves PTQ- or QAT-specific: recommending
      // either one would decide the open PTQ-vs-QAT question for the user.
      included = false;
    }
    if (included && decidedPath !== null && quantPathOf(skill) !== null && quantPathOf(skill) !== decidedPath) {
      // The query committed to one quantization path; the opposite path's
      // dedicated workflows are mutually exclusive and must not be
      // recommended alongside it. Generic entries and helpers stay.
      included = false;
    }
    if (!included || score <= 0) continue;

    matches.push({
      skill,
      score,
      matched_terms: [...new Set([...hits.name, ...hits.path, ...hits.pack, ...hits.description])],
      match_reason: matchReason(hits, exactName),
    });
  }

  matches.sort((a, b) => b.score - a.score || (a.skill.name < b.skill.name ? -1 : 1));
  const limit = Math.min(Math.max(filters.limit ?? 5, 1), 20);
  const limited = matches.slice(0, limit);

  let guidanceKind: GuidanceKind = "default";
  if (limited.length === 0) guidanceKind = "no_match";
  else if (ambiguousQuant) guidanceKind = "ambiguous_quant";
  else if (taskMatchers.length === 0) guidanceKind = "model_only";

  return { matches: limited, guidance: GUIDANCE_TEXT[guidanceKind], guidance_kind: guidanceKind };
}
