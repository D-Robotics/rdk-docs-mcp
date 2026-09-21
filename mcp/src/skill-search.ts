import { mentionedBoards, type BoardId } from "./products.js";
import { analyzeIntent, type QuantPath } from "./skill-intent.js";
import { defaultPackBoardFamilies, type PackBoardFamilyIndex } from "./skill-catalog.js";
import type { InstallType, SkillRecord } from "./skill-catalog.js";

/**
 * Pure ranking for the rdk-skills catalog (issue #4 §5). Nothing here talks to
 * the network or reads user state; every result comes from the validated
 * snapshot passed in. The rules deliberately differ from doc search: the
 * query's task intent (skill-intent.ts) is classified before PTQ/QAT
 * guardrails apply, task words must decide relevance, model words alone never
 * promote a workflow, and quantization queries without a PTQ/QAT decision are
 * disambiguated instead of guessed.
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
  /**
   * Board evidence relative to the active board constraint: "matched-board"
   * (pack families or the record itself involve a constrained board),
   * "unknown" (no board evidence — kept, but never a compatibility claim), or
   * "unconstrained" (no board is in play for this query).
   */
  platform_scope: "matched-board" | "unknown" | "unconstrained";
};

export type GuidanceKind =
  | "default"
  | "model_only"
  | "ambiguous_quant"
  | "platform_conflict"
  | "no_match"
  | "invalid_input";

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
// Classification of catalog records. The classification is token-based on
// purpose: no hand-maintained skill-name whitelist (spec §5). The query-side
// classification (task intent, PTQ/QAT decision, negation spans) lives in
// skill-intent.ts.
// ---------------------------------------------------------------------------

const QUANT_TOKENS = new Set(["量化", "quant"]);

function isQuantToken(token: string): boolean {
  return QUANT_TOKENS.has(token);
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
// Board scope (retest 2026-09-21 P1/P2). A board named in the query is a
// default constraint, consistent with an explicit platform parameter; known
// pack families (skill-catalog.ts) exclude packs proven to target another
// family; records with no board evidence stay but are reported as unknown
// scope, never as compatible. Contradictory board inputs are surfaced as a
// conflict instead of silently narrowing the recommendation.
// ---------------------------------------------------------------------------

function boardsInText(text: string): BoardId[] {
  return mentionedBoards(text);
}

type BoardConstraint = {
  /** Boards the result set is scoped to; empty means no narrowing. */
  boards: BoardId[];
  /** Set when the query and the platform parameter contradict each other. */
  conflict: { queryBoards: BoardId[]; platformBoards: BoardId[] } | null;
};

function boardConstraint(query: string, platform: string | undefined): BoardConstraint {
  const queryBoards = boardsInText(query);
  const platformBoards = platform ? boardsInText(platform.toLowerCase()) : [];
  if (platformBoards.length > 0 && queryBoards.length > 0) {
    // The platform parameter must cover every board the query names, or it is
    // trying to narrow (or contradict) an explicit user statement — including
    // a multi-board comparison, which must not collapse to one board silently.
    const covered = queryBoards.every((board) => platformBoards.includes(board));
    if (!covered) return { boards: [], conflict: { queryBoards, platformBoards } };
  }
  if (platformBoards.length > 0) return { boards: platformBoards, conflict: null };
  // A single board named in the query narrows by default; a multi-board query
  // is a comparison and stays open.
  if (queryBoards.length === 1) return { boards: queryBoards, conflict: null };
  return { boards: [], conflict: null };
}

type FamilyResolver = (packName: string) => readonly BoardId[] | undefined;

function familyResolver(packFamilies?: PackBoardFamilyIndex): FamilyResolver {
  return (packName: string) => packFamilies?.get(packName) ?? defaultPackBoardFamilies(packName);
}

/**
 * Board evidence for one record under an active constraint: matched via pack
 * families or the record's own board mentions, unknown when no evidence
 * exists (kept, never claimed compatible).
 */
function boardScopeOf(
  skill: SkillRecord,
  constraintBoards: BoardId[],
  families: FamilyResolver,
): { included: boolean; scope: "matched-board" | "unknown" | "unconstrained" } {
  if (constraintBoards.length === 0) return { included: true, scope: "unconstrained" };
  const packFamilies = families(skill.pack);
  if (packFamilies && packFamilies.length > 0) {
    const matched = packFamilies.some((board) => constraintBoards.includes(board));
    return { included: matched, scope: matched ? "matched-board" : "unknown" };
  }
  const mentioned = boardsInText(`${skill.name} ${skill.description} ${skill.pack}`);
  if (mentioned.length === 0) return { included: true, scope: "unknown" };
  const matched = constraintBoards.some((board) => mentioned.includes(board));
  return { included: matched, scope: matched ? "matched-board" : "unknown" };
}

/** Explicit unknown platform strings keep the strict every-token text filter. */
function passesUnknownPlatformFilter(skill: SkillRecord, platform: string): boolean {
  const text = `${skill.name} ${skill.description} ${skill.pack}`.toLowerCase();
  return skillQueryTokens(platform).every((token) => buildMatcher(token).test(text));
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
/**
 * For a ready-model ask, records whose *positive* description asserts consumer
 * vocabulary (ready-made, 现成, pretrained, ...) outrank maintainer workflows
 * of the same family. Derived from description metadata, not a name whitelist.
 */
const READY_CONSUMER_BONUS = 15;
const READY_CONSUMER_MARKER =
  /现成|ready-made|ready to use|pretrained|预训练|开箱即用|published benchmarks|跑示例|模型库/;

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
  readyModelIntent: boolean,
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
  if (readyModelIntent) {
    // Consumer-entry preference: only positive sentences count, so the
    // maintainer skills' "Do not use ... ready-made use" lines never qualify.
    const positiveSentences = splitSentences(skill.description).filter(
      (sentence) => !NEGATION_CUES.test(sentence),
    );
    if (positiveSentences.some((sentence) => READY_CONSUMER_MARKER.test(sentence))) {
      score += READY_CONSUMER_BONUS;
    }
  }
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
  platform_conflict:
    "The board named in the query and the platform parameter contradict each other. No candidate is recommended for either side; ask the user which board they actually target before searching again.",
  no_match:
    "No skill in the catalog snapshot matched. Do not invent skill names or install commands; ask the user to rephrase with the concrete task, and fall back to official docs where applicable.",
  invalid_input:
    "The query has no usable search terms (only punctuation, numbers, or filler words). Do not recommend any skill from this input; ask the user to rephrase with the concrete task or board model.",
};

/** A ready-model ask that also asks to quantize: clarify the task, not just PTQ vs QAT. */
const MIXED_MODEL_GUIDANCE =
  "The query mixes consuming a ready-made (already quantized) model with running quantization yourself. These are different tasks: the Model Zoo serves ready-made models, while PTQ (calibration) and QAT (quantization-aware training) are for quantizing a model yourself. Ask the user which they want before recommending; do not guess one and do not present a PTQ/QAT sub-step as the decided answer.";

const BOARD_LABEL: Record<BoardId, string> = { x3: "X3", x5: "X5", s100: "S100", s600: "S600" };

function conflictGuidance(conflict: { queryBoards: BoardId[]; platformBoards: BoardId[] }): string {
  const querySide = conflict.queryBoards.map((board) => BOARD_LABEL[board]).join(" + ");
  const platformSide = conflict.platformBoards.map((board) => BOARD_LABEL[board]).join(" + ");
  return `${GUIDANCE_TEXT.platform_conflict} (query names ${querySide}; platform parameter narrows to ${platformSide}.)`;
}

/**
 * Rank catalog skills for a query. Throws no errors for content reasons —
 * zero matches are a valid outcome with no_match guidance, a query with zero
 * usable tokens is reported as invalid_input, and contradictory board inputs
 * are reported as platform_conflict instead of silently narrowing.
 */
export function searchSkillRecords(
  skills: SkillRecord[],
  query: string,
  filters: SearchFilters = {},
  packFamilies?: PackBoardFamilyIndex,
): SkillSearchOutcome {
  const intent = analyzeIntent(query);
  const tokens = skillQueryTokens(query).filter((token) => !intent.isNegatedToken(token));
  if (tokens.length === 0) {
    return { matches: [], guidance: GUIDANCE_TEXT.invalid_input, guidance_kind: "invalid_input" };
  }
  const taskTokens = [...new Set([...tokens, ...intent.conceptTokens])];
  const taskMatchers = taskTokens.filter((token) => !MODEL_WORDS.has(token)).map(buildMatcher);
  const modelMatchers = taskTokens.filter((token) => MODEL_WORDS.has(token)).map(buildMatcher);
  // The PTQ/QAT path the query commits to; null while undecided (or when both
  // paths are mentioned, e.g. a comparison question).
  const decidedPath: QuantPath | null = intent.decidedQuantPath;
  // Guardrails only apply once the intent is actually "quantize": a ready-model
  // ask mentioning quantization words must not be pushed into PTQ/QAT clarity.
  const ambiguousQuant =
    (intent.intent === "quantize" || intent.mixedModelAsk) && decidedPath === null;

  const constraint = boardConstraint(query, filters.platform);
  if (constraint.conflict) {
    return {
      matches: [],
      guidance: conflictGuidance(constraint.conflict),
      guidance_kind: "platform_conflict",
    };
  }
  const families = familyResolver(packFamilies);

  const unknownPlatform =
    filters.platform && boardsInText(filters.platform.toLowerCase()).length === 0
      ? filters.platform.trim()
      : undefined;
  const pool = skills.filter((skill) => {
    if (filters.installType && skill.install_type !== filters.installType) return false;
    if (filters.pack && skill.pack.toLowerCase() !== filters.pack.trim().toLowerCase()) return false;
    const scope = boardScopeOf(skill, constraint.boards, families);
    if (!scope.included) return false;
    if (unknownPlatform && !passesUnknownPlatformFilter(skill, unknownPlatform)) return false;
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
      intent.intent === "ready_model",
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
      platform_scope: boardScopeOf(skill, constraint.boards, families).scope,
    });
  }

  matches.sort((a, b) => b.score - a.score || (a.skill.name < b.skill.name ? -1 : 1));
  const limit = Math.min(Math.max(filters.limit ?? 5, 1), 20);
  const limited = matches.slice(0, limit);

  // Guidance is chosen from the intent first, then from the candidate shape:
  // a genuinely undecided quantization ask keeps its clarification even when
  // no candidate matched (Chinese 量化 and English quantization behave alike).
  let guidanceKind: GuidanceKind = "default";
  if (ambiguousQuant) guidanceKind = "ambiguous_quant";
  else if (limited.length === 0) guidanceKind = "no_match";
  else if (taskMatchers.length === 0) guidanceKind = "model_only";
  const guidance =
    guidanceKind === "ambiguous_quant" && intent.mixedModelAsk
      ? MIXED_MODEL_GUIDANCE
      : GUIDANCE_TEXT[guidanceKind];

  return { matches: limited, guidance, guidance_kind: guidanceKind };
}
