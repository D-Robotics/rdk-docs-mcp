# RDK Assistant MCP Reliability Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Repair the audited correctness and usability failures while preserving existing installations.

**Architecture:** Keep caller intent interpretation outside MCP. Separate reliable transport/storage, bounded source evidence, validated discovery metadata, and capability reporting. Read upstream metadata when present and retain the existing reviewed overlay as an explicit compatibility adapter.

**Tech Stack:** Node >=20, TypeScript, MCP SDK, zod, Vitest; existing dependencies only.

**Spec:** `docs/superpowers/specs/2026-09-22-assistant-reliability-design.md`

## Global constraints

- Human title `RDK Assistant MCP`; retain npm/bin `rdk-docs-mcp`, config id `rdk-docs`, old tool and Skill names.
- Prepare `0.2.0`; do not publish or merge. Work only in this repair worktree.
- No new inference dependency, automatic installs, guessed compatibility, or silent fallback across explicit constraints.
- No changes to actual user HOME/config/installed packages during tests. Use isolated temp directories.
- Parallel ownership: runtime agent owns http/install; document agent owns service/search/products/types/content-window; discovery agent owns skill-structured/taxonomy/skill-search types and search section of skill-service. Controller alone owns server/index/package/docs and later optional get_skill body.

## Review focus

- A cache with an otherwise valid timestamp but the wrong URL must miss (Task 1).
- Generic/shared-board documentation must survive stricter single-board filtering (Task 2).
- Declared upstream metadata with an invalid enum must not silently fall back to reviewed metadata (Task 3).
- A changed page/Skill between continuation calls must be rejected (Tasks 2 and 4).
- An installed old server/new guidance mixture must be diagnosable without claiming the old server supports new fields (Task 5).

## Task 1: Reliable cache and atomic installed files

**Files:** `mcp/src/http.ts`, new `http.test.ts`, `install.ts`, `install.test.ts`; optional dedicated atomic-file helper.
**Interfaces:** Preserve `fetchText: HttpGet` and installer public functions. Cache format is internal; errors persist on stderr only, never protocol stdout.

- [x] Add failing tests: fetch `/a/b` then `/a_b` with different mocked bodies; corrupt metadata, mismatched URL, future timestamp; successful HTTP with cache path set to an existing file. Add installer replacement-failure test preserving original bytes.
```ts
expect(await fetchText('https://example.test/a/b')).toBe('first');
expect(await fetchText('https://example.test/a_b')).toBe('second');
```
- [x] Run `npx vitest run src/http.test.ts src/install.test.ts`, observe failures for current defects.
- [x] Use URL SHA-256, one atomically replaced envelope, strict metadata validation, best-effort cache persistence. Make Skill/JSON/DSH replacement atomic without loosening TOML validation.
- [x] Re-run the focused tests; self-review and report exact test counts and files. Controller reviews diff before committing.

## Task 2: Board-scoped and complete document evidence

**Files:** `mcp/src/search.ts`, `service.ts`, `types.ts`, relevant tests; new `content-window.ts`/test.
**Interfaces:** Extend PageInput with `offset?:number, expected_content_hash?:string`. Export `sliceContent(text:string,input:{offset?:number,maxChars?:number,expectedContentHash?:string})` returning `{text,offset,next_offset:number|null,total_chars,content_hash,truncated}`. getPage retains markdown/title/url/truncated and adds window fields, `content_source` (`html|search_index|forum|unavailable`) and evidence notes. Controller wires MCP schema.

- [x] Add failing single-board result tests using mixed X3/X5/S documents and generic/shared titles. Preserve comparison coverage. Add pagination reassembly/hash-change tests.
```ts
const first = sliceContent('abcdef', {maxChars:3});
expect(sliceContent('abcdef', {offset:3,maxChars:3,expectedContentHash:first.content_hash}).text).toBe('def');
expect(() => sliceContent('changed', {offset:3,expectedContentHash:first.content_hash})).toThrow();
```
- [x] Run focused tests and observe failures.
- [x] Filter explicit incompatible board scope before ranking; do not drop genuinely shared pages. Refactor getPage slicing once, expose HTML/index/forum origins and image/truncation limitations.
- [x] Re-run `npx vitest run src/search.test.ts src/service.test.ts src/content-window.test.ts`; report result. Controller independently replays live X3 camera query.

## Task 3: Validated discovery metadata and truthful search states

**Files:** new `mcp/src/skill-metadata.ts` and tests; `skill-structured.ts`, `skill-structured.test.ts`, `skill-taxonomy-data.ts`, `skill-search.ts` types, `skill-service.ts` search interfaces/implementation and tests. Leave getSkillDetail implementation to controller.
**Interfaces:** Preserve classificationFor compatibility. Export metadata coverage usable by status and search: total/classified/missing/stale/invalid/unknown_platform counts. Support upstream discovery contract from spec; reviewed overlay remains strict fingerprint matching. Add TASKS `model_compile` and `network`, optional role filter `entry|workflow|step`. Expose `metadata_health` plus per-candidate evidence origin/status; category-only guidance when no candidate has lexical hits. Do not redefine legacy query-only behavior.

- [x] Add failing tests for appended description space (stale vs missing), invalid declared metadata, a valid metadata-bearing synthetic record, pure compile without workflow, unknown scope, category-only query, role filter, and constraints with multi-board records.
```ts
const result = searchStructured(skills, '!!!', {task:'camera'});
expect(result.guidance_kind).toBe('category_only');
```
- [x] Run `npx vitest run src/skill-structured.test.ts src/skill-service.test.ts src/skill-metadata.test.ts`, observe failures.
- [x] Implement schemas/health statuses, reformat the current compact structured search into readable helpers. Review fixture descriptions to add explicit compile/network/diagnostics classification entries; do not classify from name guesses alone. Record why each addition is supported.
- [x] Validate overlay enum/source/name consistency; publish a coverage report for every fixture record, not a false claim of full coverage. Re-run tests and report.

## Task 4: Revision-bound Skill content

**Files:** `mcp/src/skill-content.ts` and tests, getSkillDetail portion of `skill-service.ts`, detail tests, `server.ts` schema after Task 3.
**Interfaces:** Extend detail input with `include_content?:boolean,max_chars?:number,offset?:number,expected_content_hash?:string`; add injectable `fetchContent` to SkillServiceDeps. Summary remains default. Optional content includes pinned source URL, status `available|unavailable`, window/hash and markdown; body retrieval errors cannot be mistaken for verified content.

- [x] Add failing test checking exact `raw.githubusercontent.com/D-Robotics/rdk-skills/<snapshot SHA>/<catalog_path>/SKILL.md` request, source error, bounded continuation and changed body.
- [x] Implement bounded, timed content HTTP (maximum 1 MiB; no arbitrary user URL), shared window helper; treat body as reference data only. Expose flat installation's existing unpinned policy and required source verification.
- [x] Run `npx vitest run src/skill-content.test.ts src/skill-service.test.ts src/skill-server.test.ts` and build.

## Task 5: Capability reporting, compatible naming and packaging

**Files:** new `mcp/src/status.ts` and tests; `server.ts`, `server.test.ts`, `skill-server.test.ts`, `index.ts`, package manifests; new Node prepack script; README/install instructions/bundled `skills/rdk-docs/SKILL.md`.
**Interfaces:** `get_status` and `--doctor` expose display name, package/version, stable ids, protocol feature flags, task enum, catalog revision/coverage/error. Doctor branches before Skill refresh. `get_status` optionally checks catalog so network failures do not hide static capabilities. New structured Skill tool schemas reject unknown properties.

- [x] Write failing status/schema tests asserting title, version, task/role/body fields, unsupported parameter rejection and catalog failure reporting.
- [x] Add read-only diagnostics and wire document pagination/Skill content schemas. Bump package + lockfile to 0.2.0, preserve legacy identifiers, replace shell prepack with Node copies, add offline discovery/contract validation to default verify.
- [x] Update user guide and caller Skill: capability check once, explicitly handle category-only/unknown/stale, compile vs quantize, inspect content before execution advice; document metadata producer schema and rename rationale.
- [x] Run full tests/build; package tarball in temp location and smoke-test its schema/doctor with isolated HOME. Confirm bundled guide and server agree.

## Task 6: Independent acceptance and review

**Files:** executable audit/acceptance tests where stable; `docs/reviews/2026-09-22-assistant-reliability-acceptance.md` and machine evidence.

- [x] Run representative ready-model/quantize/compile/network/camera/unknown/negation scenarios against the MCP protocol; assertions check constraints, source and metadata status, not just top name.
- [x] Live-test X3/X5 camera/GPIO and pinned Skill content, report failures/limitations separately from offline tests.
- [x] Obtain fresh independent whole-branch review; fix substantive findings and re-run affected tests. Complete one full final test/build/pack validation after all changes.
- [ ] Commit focused changes, push repair branch and create/attach a reviewable PR (existing task authorization includes PR delivery). Do not merge or publish npm. Record actual remaining limits and upstream metadata adoption work.

## Execution ledger

Plan approved for immediate execution by the user's request. Tasks 1–3 are independent by file ownership and run in parallel; Tasks 4–5 integrate their outputs; Task 6 gates delivery. The controller reviews each workstream and a fresh reviewer checks the integrated branch. Progress and concrete verification evidence will be recorded in the acceptance report.
