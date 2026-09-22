import {createHash} from 'node:crypto';
import type {SkillRecord} from './skill-catalog.js';
import {SkillError} from './skill-catalog.js';
import {skillQueryTokens, type SkillSearchOutcome, type RankedSkill} from './skill-search.js';
import {TAXONOMY_DATA} from './skill-taxonomy-data.js';

export const TASKS = ['camera','gpio','uart','ready_model','model_conversion','model_deploy','model_maintenance','environment','diagnostics','bsp'] as const;
export const PLATFORMS = ['x3','x5','s100','s100p','s600','ultra'] as const;
export type Task = typeof TASKS[number];
export type StructuredFilters = {
 task: Task; platform?: string; exclude_platforms?: string[];
 workflow?: 'ptq'|'qat'|'undecided'|null; pack?: string; installType?: string; limit?: number;
};
export type Classification = {tasks:readonly string[];workflows:readonly string[];platforms:readonly string[]|null;role:string;source:string;fingerprint:string};
const metadata=new Map<string,Classification>(TAXONOMY_DATA.map(({name,...value})=>[name,value]));
/** Canonical JSON preserves all upstream fields, including future metadata. */
function canonicalJson(value: unknown): string {
 if(Array.isArray(value)) return '['+value.map(canonicalJson).join(',')+']';
 if(value !== null && typeof value === 'object') {
  const object=value as Record<string,unknown>;
  return '{'+Object.keys(object).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(object[key])).join(',')+'}';
 }
 return JSON.stringify(value) ?? 'null';
}
export function classificationFor(s:SkillRecord):Classification|undefined {
 const entry=metadata.get(s.name);
 const fingerprint=createHash('sha256').update(canonicalJson(s)).digest('hex');
 return entry?.fingerprint===fingerprint ? entry : undefined;
}
function board(value:string):string {
 const normalized=value.trim().toLowerCase().replace(/^rdk[ -]*/, '');
 if(!(PLATFORMS as readonly string[]).includes(normalized)) throw new SkillError('invalid_input','Structured platform must be one of: '+PLATFORMS.join(', ')+'. Split comparisons into one search per board.');
 return normalized;
}
export function searchStructured(skills:SkillRecord[],query:string,filters:StructuredFilters):SkillSearchOutcome {
 if(!(TASKS as readonly string[]).includes(filters.task)) throw new SkillError('invalid_input','Unknown task. Use the advertised task enum.');
 if(filters.workflow!=null && !['ptq','qat','undecided'].includes(filters.workflow)) throw new SkillError('invalid_input','Unknown workflow');
 if(filters.workflow!=null && filters.task!=='model_conversion') throw new SkillError('invalid_input','workflow only applies to model_conversion');
 const target=filters.platform ? board(filters.platform) : undefined;
 const excluded=(filters.exclude_platforms??[]).map(board);
 if(target && excluded.includes(target)) return {matches:[],guidance_kind:'platform_conflict',guidance:'The explicit target is also excluded. Clarify the target; query prose does not override structured constraints.'};
 const undecided=filters.task==='model_conversion' && (!filters.workflow || filters.workflow==='undecided');
 const terms=skillQueryTokens(query);
 const matches:RankedSkill[]=[];
 for(const skill of skills){
  const meta=classificationFor(skill);
  if(!meta?.tasks.includes(filters.task)) continue;
  if(filters.pack && skill.pack.toLowerCase()!==filters.pack.toLowerCase()) continue;
  if(filters.installType && skill.install_type!==filters.installType) continue;
  if(meta.platforms && (target ? !meta.platforms.includes(target) : meta.platforms.some(p=>excluded.includes(p)))) continue;
  if(undecided && meta.role!=='entry') continue;
  if(filters.workflow && filters.workflow!=='undecided' && !meta.workflows.includes(filters.workflow)) continue;
  // Prose ranks within the eligible set only. It never decides intent or board scope.
  const text=(skill.name+' '+skill.description).toLowerCase();
  const hits=terms.filter(t=>text.includes(t));
  const score=(skill.name===query.trim()?100:0)+(meta.role==='entry'?3:meta.role==='workflow'?2:0)+Math.min(hits.length,8)*2+terms.filter(t=>skill.name.includes(t)).length*4;
  matches.push({skill,score,matched_terms:hits,match_reason:`reviewed task=${filters.task}; role=${meta.role}; source=${meta.source}`,platform_scope:target||excluded.length ? meta.platforms?'matched-board':'unknown':'unconstrained'});
 }
 matches.sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name));
 return {matches:matches.slice(0,filters.limit??5),guidance_kind:undecided?'ambiguous_quant':matches.length?'default':'no_match',guidance:undecided?'Clarify PTQ versus QAT from user context; only workflow entry skills are returned. Do not guess from query words.':'Candidates satisfy reviewed task metadata. Read get_skill before recommending. Unknown platform scope is not verified compatibility. No match may mean metadata is missing or stale; fall back to official docs, never relax explicit constraints silently.'};
}
