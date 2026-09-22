import type { SkillRecord } from './skill-catalog.js';
import { SkillError } from './skill-catalog.js';
import { skillQueryTokens, type SkillSearchOutcome, type RankedSkill, type GuidanceKind } from './skill-search.js';
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
  const terms = skillQueryTokens(query);
  const matches: RankedSkill[] = [];
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
    const score = (name === query.trim().toLowerCase() ? 100 : 0)
      + (metadata.role === 'entry' ? 3 : metadata.role === 'workflow' ? 2 : 0)
      + Math.min(hits.length, 8) * 2 + terms.filter(term => name.includes(term)).length * 4;
    matches.push({ skill, score, matched_terms: hits, metadata_evidence: evidence,
      match_reason: `${evidence.origin} task=${filters.task}; role=${metadata.role}; source=${metadata.source}`,
      platform_scope: target || excluded.length ? metadata.platforms ? 'matched-board' : 'unknown' : 'unconstrained',
    });
  }
  matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
  const limited = matches.slice(0, filters.limit ?? 5);
  let kind: GuidanceKind;
  if (limited.length > 0 && limited.every(match => match.matched_terms.length === 0)) kind = 'category_only';
  else if (undecided) kind = 'ambiguous_quant';
  else if (!matches.length) kind = health.missing + health.stale + health.invalid > 0 ? 'metadata_incomplete' : 'no_match';
  else kind = matches.some(match => match.matched_terms.length > 0) ? 'default' : 'category_only';
  const clarification = kind === 'category_only' && undecided ? ' Clarify PTQ versus QAT before selecting a workflow.' : '';
  return { matches: limited, metadata_health: health, guidance_kind: kind, guidance: guidanceFor(kind) + clarification };
}
