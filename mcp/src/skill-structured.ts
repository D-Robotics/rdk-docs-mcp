import type { SkillRecord } from './skill-catalog.js';
import { SkillError } from './skill-catalog.js';
import { skillQueryTokens, type SkillSearchOutcome, type RankedSkill, type GuidanceKind } from './skill-search.js';
import { analyzeIntent } from './skill-intent.js';
import { TASKS, PLATFORMS, ROLES, metadataHealth, resolveMetadata, type Classification, type Task, type Role } from './skill-metadata.js';
export { TASKS, PLATFORMS, ROLES, classificationFor, type Classification, type Task, type Role } from './skill-metadata.js';

export type StructuredFilters = {
  task: Task;
  platform?: string;
  exclude_platforms?: string[];
  workflow?: 'ptq' | 'qat' | 'undecided' | null;
  role?: Role;
  pack?: string;
  installType?: string;
  limit?: number;
};

function board(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^rdk[ -]*/, '');
  if (!(PLATFORMS as readonly string[]).includes(normalized)) {
    throw new SkillError('invalid_input', 'Structured platform must be one of: ' + PLATFORMS.join(', ') + '. Split comparisons into one search per board.');
  }
  return normalized;
}
function validateFilters(filters: StructuredFilters): void {
  if (!(TASKS as readonly string[]).includes(filters.task)) throw new SkillError('invalid_input', 'Unknown task. Use the advertised task enum.');
  if (filters.role !== undefined && !(ROLES as readonly string[]).includes(filters.role)) throw new SkillError('invalid_input', 'Unknown role. Use the advertised role enum.');
  if (filters.workflow != null && !['ptq', 'qat', 'undecided'].includes(filters.workflow)) throw new SkillError('invalid_input', 'Unknown workflow');
  if (filters.workflow != null && filters.task !== 'model_conversion') throw new SkillError('invalid_input', 'workflow only applies to model_conversion');
}
function platformEligible(metadata: Classification, allowed: string[]): boolean {
  // Unknown scope remains visible, but cannot override an empty target set.
  return allowed.length > 0 && (metadata.platforms === null || metadata.platforms.some(platform => allowed.includes(platform)));
}

// Remove a negated English workflow phrase before extracting ranking terms.
const ENGLISH_NEGATED_WORKFLOW = /\b(?:without|not|no|avoid|exclude|excluding)\s+(?:(?:use|using|do|doing|run|running|perform|performing)\s+)?(?:ptq|(?:post[-\s]+training\s+)?(?:re-?)?quantiz(?:e|ation|ing))\b/gi;
const ENGLISH_WORKFLOW_EXCLUDED = /\b(?:ptq|post[-\s]+training(?:\s+quantization)?)\s+(?:(?:is|are|was|were)\s+)?(?:not\s+(?:allowed|permitted|supported|needed|wanted)|forbidden|prohibited|excluded)\b/gi;

/** These cues change ranking only; they do not establish artifact compatibility. */
function excludesPtq(query: string, intent: ReturnType<typeof analyzeIntent>): boolean {
  if (intent.isNegatedToken('ptq')) return true;
  const chineseBefore = /(?:不要|不用|不做|不选|不走|不使用|不采用|不再|不需要|不想|不希望|不打算|不允许|请勿|勿|禁止|无需|排除|拒绝|避免|别)\s*(?:(?:再|再次|用|做|走|进行|使用|采用|执行|跑|重新)\s*){0,2}(?:\bptq\b|量化)/i;
  const chineseAfter = /\bptq\b\s*(?:不用|不要|不做|不选|不需要|除外|排除)/i;
  return chineseBefore.test(query) || [...query.matchAll(ENGLISH_NEGATED_WORKFLOW)].length > 0 || chineseAfter.test(query) || [...query.matchAll(ENGLISH_WORKFLOW_EXCLUDED)].length > 0;
}

function hasProcessedCompileInput(query: string, intent: ReturnType<typeof analyzeIntent>): boolean {
  const completed = /(?:已(?:经)?(?:完成)?|预(?:先)?|事先|提前)(?:量化|校准)|(?:量化|校准)(?:(?:已经|已)?(?:完成|完毕|好|过)|后\s*(?:的|模型|文件|产物|onnx\b))|\b(?:quantized|calibrated)\b/g;
  return [...query.matchAll(completed)].some(match => {
    const before = query.slice(Math.max(0, match.index! - 12), match.index);
    const negated = /(?:尚未|未|还没|没有|未经|并未|不曾|未曾|\bnot\s+(?:yet\s+)?)\s*$/.test(before);
    return !negated && !intent.isNegatedToken(match[0]);
  });
}

/** Generic source-model requests favor a reviewed PTQ workflow, not a specialized step. */
function ordinaryCompileFormats(query: string, intent: ReturnType<typeof analyzeIntent>): string[] {
  const specialized = /\b(?:qat|hbdk|hbir|compile_model|horizon_plugin_pytorch|fake_quantize|custom|advanced)\b|自定义|高级/g;
  if (intent.decidedQuantPath === 'qat' || [...query.matchAll(specialized)].some(match => !intent.isNegatedToken(match[0]))) return [];
  return ['onnx', 'caffe'].filter(format => new RegExp(`\\b${format}\\b`).test(query) && !intent.isNegatedToken(format));
}

function mentionsFormat(description: string, format: string): boolean {
  const marker = new RegExp(`\\b${format}\\b`, 'i');
  const exclusion = /不支持|不适用|不处理|不用于|不能|禁止|排除|\b(?:not|no|never|unsupported|without|except)\b|do not|don't/i;
  return description.split(/(?:[。；;!！?？\n]|(?<=\.)\s+)/).some(sentence => marker.test(sentence) && !exclusion.test(sentence));
}
function guidanceFor(kind: GuidanceKind): string {
  const limits = 'Read get_skill before recommending. Unknown platform scope is not verified compatibility. Never relax explicit constraints silently.';
  switch (kind) {
    case 'ambiguous_quant': return 'Clarify PTQ versus QAT from user context; only entry skills are returned. Do not guess from query words. ' + limits;
    case 'category_only': return 'These are task-category candidates only: none has lexical evidence for this query. Clarify the concrete request before recommending. ' + limits;
    case 'metadata_incomplete': return 'No eligible candidate was found in validated metadata, but catalog metadata is missing, stale or invalid. This does not establish that the catalog has no relevant skill. Fall back to official docs or inspect catalog records. ' + limits;
    case 'no_match': return 'No candidate satisfies the explicit constraints in this catalog snapshot. ' + limits;
    default: return 'Candidates satisfy validated task metadata. ' + limits;
  }
}

export function searchStructured(skills: SkillRecord[], query: string, filters: StructuredFilters): SkillSearchOutcome {
  validateFilters(filters);
  const health = metadataHealth(skills);
  const target = filters.platform ? board(filters.platform) : undefined;
  const excluded = (filters.exclude_platforms ?? []).map(board);
  if (target && excluded.includes(target)) {
    return { matches: [], metadata_health: health, guidance_kind: 'platform_conflict', guidance: 'The explicit target is also excluded. Clarify the target; query prose does not override structured constraints.' };
  }
  const allowed = (target ? [target] : [...PLATFORMS]).filter(platform => !excluded.includes(platform));
  const undecided = filters.task === 'model_conversion' && (!filters.workflow || filters.workflow === 'undecided');
  const loweredQuery = query.toLowerCase();
  const compileIntent = filters.task === 'model_compile' ? analyzeIntent(loweredQuery) : undefined;
  const ptqExcluded = compileIntent ? excludesPtq(loweredQuery, compileIntent) : false;
  const processedInput = compileIntent ? hasProcessedCompileInput(loweredQuery, compileIntent) : false;
  const rankingQuery = compileIntent ? loweredQuery.replace(ENGLISH_NEGATED_WORKFLOW, ' ').replace(ENGLISH_WORKFLOW_EXCLUDED, ' ') : query;
  const terms = skillQueryTokens(rankingQuery).filter(term => !compileIntent?.isNegatedToken(term) && !(ptqExcluded && term === 'ptq'));
  const sourceFormats = target && compileIntent && !ptqExcluded && !processedInput ? ordinaryCompileFormats(loweredQuery, compileIntent) : [];
  const avoidPtqOnly = ptqExcluded || (Boolean(target) && processedInput && compileIntent?.decidedQuantPath !== 'ptq');
  const matches: RankedSkill[] = [];
  const ptqOnlyMatches = new Set<RankedSkill>();
  for (const skill of skills) {
    const { classification: metadata, ...evidence } = resolveMetadata(skill);
    if (!metadata?.tasks.includes(filters.task)) continue;
    if (filters.pack && skill.pack.toLowerCase() !== filters.pack.toLowerCase()) continue;
    if (filters.installType && skill.install_type !== filters.installType) continue;
    if (!platformEligible(metadata, allowed)) continue;
    if (filters.role && metadata.role !== filters.role) continue;
    if (undecided && metadata.role !== 'entry') continue;
    if (filters.workflow && filters.workflow !== 'undecided' && !metadata.workflows.includes(filters.workflow)) continue;
    // Prose ranks only within the eligible set; it never decides intent or scope.
    const name = skill.name.toLowerCase();
    const text = (skill.name + ' ' + skill.description).toLowerCase();
    const hits = terms.filter(term => text.includes(term));
    const standardWorkflow = metadata.role === 'workflow' && metadata.workflows.includes('ptq')
      && sourceFormats.some(format => mentionsFormat(skill.description, format));
    const score = (name === query.trim().toLowerCase() ? 100 : 0)
      + (metadata.role === 'entry' ? 3 : metadata.role === 'workflow' ? 2 : 0)
      + Math.min(hits.length, 8) * 2 + terms.filter(term => name.includes(term)).length * 4
      + (standardWorkflow ? 8 : 0);
    const match: RankedSkill = { skill, score, matched_terms: hits, metadata_evidence: evidence,
      match_reason: `${evidence.origin} task=${filters.task}; role=${metadata.role}; source=${metadata.source}`
        + (standardWorkflow ? '; source-format PTQ workflow priority; verify prerequisites' : ''),
      platform_scope: target || excluded.length ? metadata.platforms ? 'matched-board' : 'unknown' : 'unconstrained',
    };
    matches.push(match);
    if (avoidPtqOnly && metadata.workflows.length === 1 && metadata.workflows[0] === 'ptq') ptqOnlyMatches.add(match);
  }
  // Preserve all eligible candidates, but rank PTQ-only entries behind other
  // candidates when the user excludes PTQ or has an already-processed input.
  if (ptqOnlyMatches.size > 0 && ptqOnlyMatches.size < matches.length) {
    const highestPtqScore = Math.max(...[...ptqOnlyMatches].map(match => match.score));
    const lowestOtherScore = Math.min(...matches.filter(match => !ptqOnlyMatches.has(match)).map(match => match.score));
    const adjustment = Math.max(0, highestPtqScore - lowestOtherScore + 1);
    for (const match of ptqOnlyMatches) {
      match.score -= adjustment;
      match.match_reason += '; PTQ-only workflow ranked below other candidates';
    }
  }
  matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const limited = matches.slice(0, filters.limit ?? 5);
  let kind: GuidanceKind;
  if (limited.length > 0 && limited.every(match => match.matched_terms.length === 0)) kind = 'category_only';
  else if (undecided) kind = 'ambiguous_quant';
  else if (!matches.length) kind = health.missing + health.stale + health.invalid > 0 ? 'metadata_incomplete' : 'no_match';
  else kind = matches.some(match => match.matched_terms.length > 0) ? 'default' : 'category_only';
  const clarification = kind === 'category_only' && undecided ? ' Clarify PTQ versus QAT before selecting a workflow.' : '';
  const interpretationNote = compileIntent ? ' Verify workflow exclusions and model status against the user request; natural-language interpretation may be incomplete.' : '';
  const exclusionNote = ptqExcluded ? ' PTQ is excluded by the query; do not recommend a PTQ-only workflow.' : '';
  const processedNote = processedInput ? ' The input may be already quantized or calibrated; do not recommend solely from ranking; verify its exact format and each candidate’s prerequisites before recommending.' : '';
  return { matches: limited, metadata_health: health, guidance_kind: kind, guidance: guidanceFor(kind) + clarification + interpretationNote + exclusionNote + processedNote };
}
