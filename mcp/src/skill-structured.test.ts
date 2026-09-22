import {TAXONOMY_DATA} from "./skill-taxonomy-data.js";
import { readFileSync } from 'node:fs';
import {describe,it,expect} from 'vitest';
import {searchStructured, classificationFor} from './skill-structured.js';
import type {SkillRecord} from './skill-catalog.js';
const skills=JSON.parse(readFileSync(new URL('./fixtures/skills-reviewed.json',import.meta.url),'utf8')) as SkillRecord[];
describe('structured constraints',()=>{
 it('target overrides excluded board mentions in prose',()=>{
  const r=searchStructured(skills,'X5不是X3 相机配置运行',{task:'camera',platform:'x5',exclude_platforms:['x3']});
  expect(r.matches.length).toBeGreaterThan(0); expect(r.matches.every(m=>classificationFor(m.skill)?.tasks.includes('camera'))).toBe(true);
 });
 it('no quantization in electrical task',()=>expect(searchStructured(skills,'GPIO 电平转换',{task:'gpio',platform:'s100'}).matches.every(m=>!m.skill.name.includes('quant'))).toBe(true));
 it('ready models do not trigger quantization clarification',()=>expect(searchStructured(skills,'已量化必要时转换',{task:'ready_model'}).matches[0].skill.name).toBe('rdk-model-zoo'));
 it('QAT scope is metadata not negation parsing',()=>{
  const r=searchStructured(skills,'不要简化成PTQ',{task:'model_conversion',workflow:'qat',platform:'s100'});
  expect(r.matches.length).toBeGreaterThan(0); expect(r.matches.every(m=>classificationFor(m.skill)?.workflows.includes('qat'))).toBe(true);
 });
 it('undecided only returns entry skills',()=>{
  const r=searchStructured(skills,'PTQ QAT',{task:'model_conversion',platform:'x5'});
  expect(r.guidance_kind).toBe('ambiguous_quant');expect(r.matches.every(m=>classificationFor(m.skill)?.role==='entry')).toBe(true);
 });
 it('contradictory explicit constraints return empty',()=>expect(searchStructured(skills,'相机',{task:'camera',platform:'x5',exclude_platforms:['x5']}).guidance_kind).toBe('platform_conflict'));
 it('metadata is invalidated when source content changes',()=>expect(classificationFor({...skills.find(s=>s.name==='rdk-camera-setup')!,description:'changed'})).toBeUndefined());
 it('unknown taxonomy never fills strict task results',()=>expect(searchStructured([{...skills[0],name:'new-skill'}],'camera',{task:'camera'}).matches).toEqual([]));
 it('explicit constraints cannot be overridden by exact name',()=>expect(searchStructured(skills,'x5-ptq-deploy',{task:'camera'}).matches.some(m=>m.skill.name==='x5-ptq-deploy')).toBe(false));
});

it('every reviewed classification is tied to an exact source record',()=>{
 for(const meta of TAXONOMY_DATA){const record=skills.find(s=>s.name===meta.name);expect(record).toBeDefined();expect(classificationFor(record!)?.source).toBe(meta.source);}
});
it('unknown hardware scope is never presented as known compatibility',()=>{
 const result=searchStructured(skills,'GPIO',{task:'gpio',platform:'s100'});
 expect(result.matches.length).toBeGreaterThan(0);expect(result.matches.every(m=>m.platform_scope==='unknown')).toBe(true);
});
it('workflow without its task and unsupported platforms are errors',()=>{
 expect(()=>searchStructured(skills,'camera',{task:'camera',workflow:'qat'})).toThrow();
 expect(()=>searchStructured(skills,'camera',{task:'camera',platform:'x5/s100'})).toThrow();
});

it('maintenance ranking uses task terms instead of always preferring the entry',()=>expect(searchStructured(skills,'发版 release',{task:'model_maintenance'}).matches[0].skill.name).toBe('rdk-model-zoo-release'));

it('BSP board-specific records cannot leak across series',()=>{
 expect(searchStructured(skills,'BSP',{task:'bsp',platform:'x5',limit:20}).matches.some(m=>m.skill.name==='bsp-s-series')).toBe(false);
 expect(searchStructured(skills,'bootloader',{task:'bsp',platform:'x3',limit:20}).matches.some(m=>m.skill.name==='bsp-bootloader-build')).toBe(false);
 expect(searchStructured(skills,'BSP',{task:'bsp',platform:'s100',limit:20}).matches.some(m=>m.skill.name==='bsp-image-build')).toBe(false);
});
it('new upstream fields invalidate the reviewed classification',()=>{
 const record=skills.find(s=>s.name==='rdk-camera-setup')!;
 expect(classificationFor({...record,extra_catalog_field:{platforms:['s100']}} as SkillRecord)).toBeUndefined();
});
it('JSON key order alone does not invalidate the same record',()=>{
 const record=skills.find(s=>s.name==='rdk-camera-setup')!;
 expect(classificationFor(Object.fromEntries(Object.entries(record).reverse()) as SkillRecord)).toEqual(classificationFor(record));
});
it('pure compilation needs no quantization workflow decision', () => {
 const r=searchStructured(skills,'模型编译 compile',{task:'model_compile',platform:'x5',limit:20});
 expect(r.guidance_kind).toBe('default');
 expect(r.matches.map(m=>m.skill.name)).toEqual(expect.arrayContaining(['x5-ptq-compile','x5-qat-compile']));
 expect(searchStructured(skills,'compile',{task:'model_compile',platform:'s100',limit:20}).matches.map(m=>m.skill.name)).toEqual(expect.arrayContaining(['j6-hbdk-compile','j6-hbdk-export-compile']));
});
it('network and monitoring use reviewed descriptions', () => {
 expect(searchStructured(skills,'SSH WiFi',{task:'network'}).matches.map(m=>m.skill.name)).toContain('rdk-network-remote');
 expect(searchStructured(skills,'monitor',{task:'diagnostics',platform:'x5',limit:20}).matches.map(m=>m.skill.name)).toContain('x5-board-monitor');
 expect(searchStructured(skills,'monitor',{task:'diagnostics',platform:'s100',limit:20}).matches.map(m=>m.skill.name)).toContain('j6-board-monitor');
});
it('reports category-only results without lexical evidence', () => {
 expect(searchStructured(skills,'!!!',{task:'camera'}).guidance_kind).toBe('category_only');
 expect(searchStructured(skills,'zzznomatch',{task:'camera'}).guidance_kind).toBe('category_only');
});
it('filters explicit roles and rejects invalid roles', () => {
 const r=searchStructured(skills,'camera',{task:'camera',role:'entry'});
 expect(r.matches.length).toBeGreaterThan(0);
 expect(r.matches.every(m=>classificationFor(m.skill)?.role==='entry')).toBe(true);
 expect(()=>searchStructured(skills,'camera',{task:'camera',role:'invented' as never})).toThrow();
});
it('exclusions constrain targets rather than multi-board documents', () => {
 const shared={...skills[0],discovery:{schema_version:1,tasks:['camera'],workflows:[],platforms:['x3','x5'],role:'step'}};
 expect(searchStructured([shared],'camera',{task:'camera',exclude_platforms:['x3']}).matches).toHaveLength(1);
 expect(searchStructured([shared],'camera',{task:'camera',platform:'x5',exclude_platforms:['x3']}).matches).toHaveLength(1);
 expect(searchStructured([shared],'camera',{task:'camera',exclude_platforms:['x3','x5']}).matches).toHaveLength(0);
});
it('incomplete metadata makes empty results explicitly inconclusive', () => {
 const r=searchStructured([{...skills[0],name:'unreviewed'}],'camera',{task:'camera'});
 expect(r.guidance_kind).toBe('metadata_incomplete');
 expect(r.metadata_health).toMatchObject({total:1,missing:1});
});
it('category-only evidence stays explicit when conversion still needs clarification', () => {
 const result=searchStructured(skills,'!!!',{task:'model_conversion'});
 expect(result.matches.length).toBeGreaterThan(0);
 expect(result.guidance_kind).toBe('category_only');
 expect(result.guidance).toContain('PTQ versus QAT');
});
it('no allowed board target excludes even unknown platform records', () => {
 const unknown={...skills[0],discovery:{schema_version:1,tasks:['camera'],workflows:[],platforms:null,role:'step'}};
 expect(searchStructured([unknown],'camera',{task:'camera',exclude_platforms:['x3','x5','s100','s100p','s600','ultra']}).matches).toEqual([]);
});
