import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SkillRecord } from './skill-catalog.js';
import { classificationFor, metadataHealth, resolveMetadata, validateReviewedOverlay } from './skill-metadata.js';
import { TAXONOMY_DATA } from './skill-taxonomy-data.js';
const skills = JSON.parse(readFileSync(new URL('./fixtures/skills-reviewed.json', import.meta.url), 'utf8')) as SkillRecord[];
const camera = skills.find(s => s.name === 'rdk-camera-setup')!;
const discovery = { schema_version: 1, tasks: ['model_compile'], workflows: [], platforms: ['x5'], role: 'step' };
const upstream = (value: unknown): SkillRecord => ({ ...camera, discovery: value } as SkillRecord);
describe('validated discovery metadata', () => {
 it('accepts upstream v1 independently of the reviewed fingerprint', () => {
  expect(resolveMetadata(upstream(discovery))).toMatchObject({status:'classified',origin:'catalog',classification:{tasks:['model_compile'],platforms:['x5'],role:'step'}});
  expect(classificationFor(upstream(discovery))?.source).toContain(camera.catalog_path);
 });
 it.each([null,undefined,{}, {...discovery,schema_version:2}, {...discovery,tasks:[]}, {...discovery,tasks:['teleport']}, {...discovery,tasks:['camera','camera']}, {...discovery,workflows:['qat','qat']}, {...discovery,platforms:['x5','x5']}, {...discovery,platforms:['s900']}, {...discovery,role:'router'}, {...discovery,extra:true}])('rejects malformed declared metadata without fallback (%j)', value => {
  expect(resolveMetadata(upstream(value))).toMatchObject({status:'invalid',origin:'catalog'});
  expect(classificationFor(upstream(value))).toBeUndefined();
 });
 it('distinguishes reviewed, stale whitespace, missing and unknown scope', () => {
  const unknown=upstream({...discovery,platforms:null});
  const stale={...camera,description:camera.description+' '};
  const missing={...camera,name:'unreviewed-record'};
  expect(resolveMetadata(stale).status).toBe('stale');
  expect(resolveMetadata(missing).status).toBe('missing');
  expect(resolveMetadata(camera)).toMatchObject({status:'classified',origin:'reviewed_overlay'});
  expect(metadataHealth([camera,unknown,stale,missing,upstream(null)])).toEqual({total:5,classified:2,missing:1,stale:1,invalid:1,unknown_platform:2});
 });
 it('validates overlay enums, duplicate names and record-bound source paths', () => {
  expect(validateReviewedOverlay(TAXONOMY_DATA,skills)).toEqual([]);
  expect(validateReviewedOverlay([{...TAXONOMY_DATA[0],tasks:['wrong']}],skills).length).toBeGreaterThan(0);
  expect(validateReviewedOverlay([TAXONOMY_DATA[0],TAXONOMY_DATA[0]],skills).length).toBeGreaterThan(0);
  expect(validateReviewedOverlay([{...TAXONOMY_DATA[0],source:TAXONOMY_DATA[1].source}],skills).length).toBeGreaterThan(0);
  expect(validateReviewedOverlay([{...TAXONOMY_DATA[0],name:'missing'}],skills).length).toBeGreaterThan(0);
 });
 it('rejects an empty platform array; unknown scope is expressed by null', () => {
  expect(resolveMetadata(upstream({...discovery,platforms:[]}))).toMatchObject({status:'invalid',origin:'catalog'});
 });
 it('accounts for every fixture without claiming complete coverage', () => {
  const health=metadataHealth(skills);
  expect(health.total).toBe(skills.length);
  expect(health.classified+health.missing+health.stale+health.invalid).toBe(health.total);
  expect(health.missing).toBeGreaterThan(0);
  expect(health.stale).toBe(0); expect(health.invalid).toBe(0);
 });
});
