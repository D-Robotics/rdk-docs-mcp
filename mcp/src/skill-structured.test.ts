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
it('finds the S-series custom compiler for an explicit QAT workflow', () => {
 const r=searchStructured(skills,'s-hbdk-compile',{task:'model_conversion',workflow:'qat',platform:'s100',limit:20});
 expect(r.matches[0]?.skill.name).toBe('s-hbdk-compile');
 expect(classificationFor(r.matches[0].skill)?.workflows).toContain('qat');
 expect(searchStructured(skills,'s-hbdk-compile',{task:'model_conversion',workflow:'qat',platform:'x5',limit:20}).matches.some(m=>m.skill.name==='s-hbdk-compile')).toBe(false);
});

it.each([
 'ONNX 模型编译',
 'S100 上编译浮点 ONNX',
 'Compile an ONNX model',
 '把浮点 Caffe 模型编译成 HBM',
 '我有一个 ONNX 浮点模型，需要在 S100 上编译成可部署的 HBM',
 'ONNX 模型编译，不用 QAT',
 '只用 PTQ 编译 ONNX，不用 QAT',
 '我想用 PTQ 编译 ONNX 模型',
 '请使用 PTQ 编译 ONNX 模型',
 'Compile ONNX model, PTQ is not only allowed but recommended',
 'Compile an ONNX model with post-training quantization',
 '请把浮点 ONNX 量化后再编译',
 '先校准后编译浮点 ONNX',
])('prioritizes the standard workflow for ordinary input: %s', query => {
 const r=searchStructured(skills,query,{task:'model_compile',platform:'s100',limit:1});
 expect(r.matches[0]?.skill.name).toBe('hmct-workflow');
});

it.each([
 '不要 PTQ，编译已经量化的 ONNX 模型',
 '不要用 PTQ，编译 ONNX',
 '不想用 PTQ 编译 ONNX 模型',
 '不希望用 PTQ 编译 ONNX 模型',
 '不打算用 PTQ 编译 ONNX 模型',
 '请勿使用 PTQ 编译 ONNX 模型',
 '不允许使用 PTQ 编译 ONNX 模型',
 '不采用 PTQ 来编译 ONNX',
 'PTQ 不用，编译 ONNX',
 'PTQ 除外，编译 ONNX',
 '不再做 PTQ，编译 ONNX',
 '不需要再次量化，编译 ONNX',
 'Compile ONNX without PTQ',
 'Compile ONNX without using PTQ',
 'Compile ONNX without quantization',
 'Compile ONNX model, PTQ is not allowed',
 'Compile ONNX model; PTQ was forbidden',
 'Compile ONNX model, no post-training quantization',
 'Compile ONNX model; post training quantization is not permitted',
])('does not recommend a PTQ-only workflow when PTQ is excluded: %s', query => {
 const r=searchStructured(skills,query,{task:'model_compile',platform:'s100',limit:1});
 expect(r.matches[0]?.skill.name).not.toBe('hmct-workflow');
 expect(r.matches[0]?.matched_terms).not.toContain('ptq');
 expect(r.matches[0]?.match_reason).not.toContain('source-format PTQ workflow priority');
 expect(r.guidance).toContain('PTQ is excluded');
});

it.each([
 'Compile ONNX model, no post-training quantization',
 'Compile ONNX model; post-training quantization is not allowed',
])('does not use negated post-training quantization as ranking evidence: %s', query => {
 const discovery={schema_version:1,tasks:['model_compile'],workflows:['ptq'],platforms:['s100'],role:'workflow'};
 const skill={...skills[0],name:'test-compile',description:'Compile ONNX with quantization.',discovery};
 const r=searchStructured([skill],query,{task:'model_compile',platform:'s100',limit:20});
 expect(r.matches.length).toBeGreaterThan(0);
 expect(r.matches[0].matched_terms).not.toContain('quant');
});

it('warns that natural-language compilation constraints require caller verification', () => {
 const r=searchStructured(skills,'Compile ONNX model',{task:'model_compile',platform:'s100'});
 expect(r.guidance).toContain('natural-language interpretation may be incomplete');
 expect(r.guidance).toContain('workflow exclusions and model status');
});

it('keeps affirmative quantization evidence outside a negated PTQ phrase', () => {
 const discovery={schema_version:1,tasks:['model_compile'],workflows:['qat'],platforms:['s100'],role:'step'};
 const skill={...skills[0],name:'test-compile',description:'Compile ONNX with QAT quantization.',discovery};
 const r=searchStructured([skill],'Compile ONNX, no post-training quantization, use QAT quantization',{task:'model_compile',platform:'s100'});
 expect(r.matches[0].matched_terms).toContain('quant');
});

it.each([
 '编译已经量化的 ONNX 模型',
 'ONNX 模型已经完成量化，进行编译',
 'ONNX 模型已完成校准，进行编译',
 'ONNX 模型量化完成后编译',
 '编译量化好的 ONNX 模型',
 '编译量化后的 ONNX 模型',
 'ONNX 模型已经校准，直接编译',
 '编译校准后的 ONNX 模型',
 '编译校准过的 ONNX 模型',
 'Compile the already quantized ONNX model',
 'Compile the previously calibrated ONNX model',
 '不要 PTQ，编译 ONNX 模型',
 'Compile ONNX without PTQ',
])('does not promote fresh PTQ for a processed model or excluded PTQ: %s', query => {
 const r=searchStructured(skills,query,{task:'model_compile',platform:'s100',limit:20});
 expect(r.matches.length).toBeGreaterThan(0);
 expect(r.matches.every(m=>!m.match_reason.includes('source-format PTQ workflow priority'))).toBe(true);
});

it('does not infer a board from processed input when no target is specified', () => {
 const r=searchStructured(skills,'编译已经量化的 ONNX 模型',{task:'model_compile',limit:20});
 expect(r.matches.some(m=>m.skill.pack==='OE Tool Chain (X5)')).toBe(true);
 expect(r.matches.some(m=>m.skill.pack==='OE Tool Chain (S)')).toBe(true);
 expect(r.matches.every(m=>!m.match_reason.includes('PTQ-only workflow ranked below'))).toBe(true);
 expect(r.guidance).toContain('already quantized or calibrated');
});

it('requires prerequisite checks for a processed ONNX model', () => {
 const r=searchStructured(skills,'ONNX 模型已经校准，直接编译',{task:'model_compile',platform:'s100',limit:1});
 expect(r.matches[0]?.skill.name).not.toBe('hmct-workflow');
 expect(r.guidance).toContain('already quantized or calibrated');
 expect(r.guidance).toContain('verify');
 expect(r.guidance).toContain('do not recommend solely from ranking');
});

it('keeps all classified candidates and orders them by score when PTQ is excluded', () => {
 const r=searchStructured(skills,'不要 PTQ，编译已经量化的 ONNX 模型',{task:'model_compile',platform:'s100',limit:20});
 expect(r.matches.map(m=>m.skill.name)).toEqual(expect.arrayContaining(['hmct-workflow','s-hbdk-compile','s-hbdk-export-compile']));
 expect(r.matches.every((m,i)=>i===0 || r.matches[i-1].score>=m.score)).toBe(true);
});

it('does not demote an explicitly requested PTQ workflow solely because input was processed', () => {
 const r=searchStructured(skills,'已校准 ONNX 模型，重新用 PTQ 编译',{task:'model_compile',platform:'s100',limit:20});
 const ptq=r.matches.find(m=>m.skill.name==='hmct-workflow');
 expect(ptq).toBeDefined();
 expect(ptq?.match_reason).not.toContain('PTQ-only workflow ranked below');
 expect(r.guidance).toContain('already quantized or calibrated');
});

it('keeps conflicting candidates visible but warns when PTQ is the only candidate', () => {
 const onlyPtq=skills.filter(s=>s.name==='hmct-workflow');
 const r=searchStructured(onlyPtq,'不要 PTQ，编译 ONNX',{task:'model_compile',platform:'s100'});
 expect(r.matches.map(m=>m.skill.name)).toEqual(['hmct-workflow']);
 expect(r.guidance).toContain('PTQ is excluded');
 expect(r.guidance).toContain('do not recommend');
});

it.each([
 'ONNX 模型尚未量化完成，准备编译',
 'ONNX 模型尚未校准完成，准备编译',
 'Compile ONNX that is not yet calibrated',
])('treats a negated completion as unprocessed: %s', query => {
 const r=searchStructured(skills,query,{task:'model_compile',platform:'s100',limit:1});
 expect(r.matches[0]?.skill.name).toBe('hmct-workflow');
 expect(r.matches[0]?.match_reason).toContain('source-format PTQ workflow priority');
});

it.each([
 ['QAT qat.bc 编译','s-hbdk-compile'],
 ['QAT 模型导出编译','s-hbdk-export-compile'],
 ['QAT 导出 ONNX 模型编译','s-hbdk-export-compile'],
 ['ONNX 量化训练模型导出编译','s-hbdk-export-compile'],
 ['ONNX compile_model.py 高级自定义编译','s-hbdk-compile'],
 ['用 s-hbdk-compile 编译 ONNX','s-hbdk-compile'],
 ['s-hbdk-compile','s-hbdk-compile'],
])('keeps a specific compilation workflow first: %s', (query, expected) => {
 const r=searchStructured(skills,query,{task:'model_compile',platform:'s100',limit:1});
 expect(r.matches[0]?.skill.name).toBe(expected);
});

it.each([
 'Does not support ONNX. Compile other models.',
 'ONNX is unsupported. Compile other models.',
 'No ONNX support. Compile other models.',
 'No .onnx support. Compile other models.',
 '不支持 model.onnx，编译其他模型。',
 '不支持 ONNX，编译其他模型。',
])('does not boost a workflow whose format mention is an exclusion: %s', description => {
 const discovery={schema_version:1,tasks:['model_compile'],workflows:['ptq'],platforms:['s100'],role:'workflow'};
 const excluded={...skills[0],name:'a-compile',description,discovery};
 const supported={...skills[0],name:'z-compile',description:'Compile ONNX models.',discovery};
 const r=searchStructured([excluded,supported],'ONNX 编译',{task:'model_compile',platform:'s100'});
 expect(r.matches[0]?.skill.name).toBe('z-compile');
});

it('recognizes an affirmative format mention after an unrelated negative sentence', () => {
 const discovery={schema_version:1,tasks:['model_compile'],workflows:['ptq'],platforms:['s100'],role:'workflow'};
 const excluded={...skills[0],name:'a-compile',description:'Does not support ONNX. Compile other models.',discovery};
 const supported={...skills[0],name:'z-compile',description:'Does not support QAT. Compile ONNX models.',discovery};
 const r=searchStructured([excluded,supported],'ONNX 编译',{task:'model_compile',platform:'s100'});
 expect(r.matches[0]?.skill.name).toBe('z-compile');
});

it('does not promote a board-specific workflow when the target is unspecified', () => {
 const r=searchStructured(skills,'ONNX 模型编译',{task:'model_compile',limit:20});
 expect(r.matches.some(m=>m.skill.pack==='OE Tool Chain (X5)')).toBe(true);
 expect(r.matches.some(m=>m.skill.pack==='OE Tool Chain (S)')).toBe(true);
 expect(r.matches.every(m=>!m.match_reason.includes('source-format PTQ workflow priority'))).toBe(true);
});

it('preserves unknown platform scope when ranking a source-format workflow', () => {
 const discovery={schema_version:1,tasks:['model_compile'],workflows:['ptq'],platforms:null,role:'workflow'};
 const unknown={...skills[0],name:'unknown-compile',description:'Compile ONNX models.',discovery};
 const r=searchStructured([unknown],'ONNX 编译',{task:'model_compile',platform:'s100'});
 expect(r.matches[0]?.platform_scope).toBe('unknown');
 expect(r.guidance).toContain('Unknown platform scope is not verified compatibility');
});

it('respects an explicit step role for ordinary ONNX compilation', () => {
 const r=searchStructured(skills,'ONNX 模型编译',{task:'model_compile',platform:'s100',role:'step',limit:20});
 expect(r.matches.length).toBeGreaterThan(0);
 expect(r.matches.every(m=>classificationFor(m.skill)?.role==='step')).toBe(true);
});

it('keeps S-series workflows out of X5 results even for ordinary ONNX input', () => {
 const r=searchStructured(skills,'ONNX 模型编译',{task:'model_compile',platform:'x5',limit:20});
 expect(r.matches.length).toBeGreaterThan(0);
 expect(r.matches.every(m=>m.skill.pack!=='OE Tool Chain (S)')).toBe(true);
});

it('pure compilation needs no quantization workflow decision', () => {
 const r=searchStructured(skills,'模型编译 compile',{task:'model_compile',platform:'x5',limit:20});
 expect(r.guidance_kind).toBe('default');
 expect(r.matches.map(m=>m.skill.name)).toEqual(expect.arrayContaining(['x5-ptq-compile','x5-qat-compile']));
 expect(searchStructured(skills,'compile',{task:'model_compile',platform:'s100',limit:20}).matches.map(m=>m.skill.name)).toEqual(expect.arrayContaining(['s-hbdk-compile','s-hbdk-export-compile']));
});
it('network and monitoring use reviewed descriptions', () => {
 expect(searchStructured(skills,'SSH WiFi',{task:'network'}).matches.map(m=>m.skill.name)).toContain('rdk-network-remote');
 expect(searchStructured(skills,'monitor',{task:'diagnostics',platform:'x5',limit:20}).matches.map(m=>m.skill.name)).toContain('x5-board-monitor');
 expect(searchStructured(skills,'monitor',{task:'diagnostics',platform:'s100',limit:20}).matches.map(m=>m.skill.name)).toContain('s-board-monitor');
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
