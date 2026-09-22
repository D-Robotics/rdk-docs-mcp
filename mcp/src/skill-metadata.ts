import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SkillRecord } from './skill-catalog.js';
import { TAXONOMY_DATA } from './skill-taxonomy-data.js';

export const TASKS = ['camera', 'gpio', 'uart', 'ready_model', 'model_conversion', 'model_compile', 'model_deploy', 'model_maintenance', 'environment', 'diagnostics', 'network', 'bsp'] as const;
export const PLATFORMS = ['x3', 'x5', 's100', 's100p', 's600', 'ultra'] as const;
export const ROLES = ['entry', 'workflow', 'step'] as const;
export type Task = typeof TASKS[number];
export type Platform = typeof PLATFORMS[number];
export type Role = typeof ROLES[number];
const unique = (values: string[]) => new Set(values).size === values.length;
const tasksSchema = z.array(z.enum(TASKS)).nonempty().refine(unique, 'tasks must be unique');
const workflowsSchema = z.array(z.enum(['ptq', 'qat'])).refine(unique, 'workflows must be unique');
const platformsSchema = z.array(z.enum(PLATFORMS)).nonempty().refine(unique, 'platforms must be unique').nullable();

/** The optional catalog field remains untrusted until this strict v1 parse succeeds. */
export const discoverySchema = z.object({
  schema_version: z.literal(1),
  tasks: tasksSchema,
  workflows: workflowsSchema,
  platforms: platformsSchema,
  role: z.enum(ROLES),
}).strict();
export type DiscoveryMetadata = z.infer<typeof discoverySchema>;
export type Classification = Omit<DiscoveryMetadata, 'schema_version'> & { source: string; fingerprint: string };
export type MetadataEvidence = {
  status: 'classified' | 'missing' | 'stale' | 'invalid';
  origin: 'catalog' | 'reviewed_overlay' | null;
  issues: string[];
};
export type MetadataResolution = MetadataEvidence & { classification?: Classification };
export type MetadataHealth = {
  total: number;
  classified: number;
  missing: number;
  stale: number;
  invalid: number;
  /** Classified records with explicitly unknown platform scope; overlaps classified. */
  unknown_platform: number;
};

const overlaySchema = discoverySchema.omit({ schema_version: true }).extend({
  name: z.string().min(1),
  source: z.string().regex(/^https:\/\/github\.com\/D-Robotics\/rdk-skills\/blob\/[a-f0-9]{40}\/skills\/.+\/SKILL\.md$/),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const overlay = new Map<string, unknown>(TAXONOMY_DATA.map(entry => [entry.name, entry]));

/** Canonical JSON preserves all catalog fields, including future passthrough fields. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(object[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
function fingerprintOf(skill: SkillRecord): string {
  return createHash('sha256').update(canonicalJson(skill)).digest('hex');
}
function sourceMatches(source: string, skill: SkillRecord): boolean {
  return source.split('/').slice(7).join('/') === skill.catalog_path + '/SKILL.md';
}
function parseIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${issue.path.join('.') || 'discovery'}: ${issue.message}`);
}

/** Offline integrity check for reviewed metadata, including every annotated record's source. */
export function validateReviewedOverlay(entries: readonly unknown[], skills: SkillRecord[]): string[] {
  const issues: string[] = [];
  const names = new Set<string>();
  for (const entry of entries) {
    const parsed = overlaySchema.safeParse(entry);
    if (!parsed.success) { issues.push(...parseIssues(parsed.error)); continue; }
    const value = parsed.data;
    if (names.has(value.name)) issues.push(`duplicate overlay name: ${value.name}`);
    names.add(value.name);
    const record = skills.find(skill => skill.name === value.name);
    if (!record) issues.push(`overlay record missing: ${value.name}`);
    else {
      if (!sourceMatches(value.source, record)) issues.push(`overlay source mismatch: ${value.name}`);
      if (fingerprintOf(record) !== value.fingerprint) issues.push(`overlay fingerprint stale: ${value.name}`);
    }
  }
  return issues;
}

export function resolveMetadata(skill: SkillRecord): MetadataResolution {
  // SkillRecord intentionally models only mandatory catalog fields. The parser
  // preserves additional fields, but does not validate their discovery shape.
  if (Object.prototype.hasOwnProperty.call(skill, 'discovery')) {
    const declared: unknown = (skill as SkillRecord & { discovery?: unknown }).discovery;
    const parsed = discoverySchema.safeParse(declared);
    if (!parsed.success) return { status: 'invalid', origin: 'catalog', issues: parseIssues(parsed.error) };
    const { schema_version: _, ...metadata } = parsed.data;
    return { status: 'classified', origin: 'catalog', issues: [], classification: {
      ...metadata, source: `catalog:${skill.catalog_path}#discovery`, fingerprint: fingerprintOf(skill),
    } };
  }
  const entry = overlay.get(skill.name);
  if (!entry) return { status: 'missing', origin: null, issues: ['No declared discovery metadata or reviewed overlay.'] };
  const parsed = overlaySchema.safeParse(entry);
  if (!parsed.success) return { status: 'invalid', origin: 'reviewed_overlay', issues: parseIssues(parsed.error) };
  // Changes to any field are stale, including catalog_path and whitespace.
  if (parsed.data.fingerprint !== fingerprintOf(skill)) {
    return { status: 'stale', origin: 'reviewed_overlay', issues: ['The reviewed fingerprint differs from the catalog record.'] };
  }
  if (!sourceMatches(parsed.data.source, skill)) {
    return { status: 'invalid', origin: 'reviewed_overlay', issues: ['The reviewed source does not match the catalog path.'] };
  }
  const { name: _, ...classification } = parsed.data;
  return { status: 'classified', origin: 'reviewed_overlay', issues: [], classification };
}

/** Backwards-compatible summary accessor; invalid and stale evidence never classifies. */
export function classificationFor(skill: SkillRecord): Classification | undefined {
  return resolveMetadata(skill).classification;
}
export function metadataHealth(skills: SkillRecord[]): MetadataHealth {
  const health: MetadataHealth = { total: skills.length, classified: 0, missing: 0, stale: 0, invalid: 0, unknown_platform: 0 };
  for (const skill of skills) {
    const result = resolveMetadata(skill);
    health[result.status] += 1;
    if (result.classification?.platforms === null) health.unknown_platform += 1;
  }
  return health;
}
