# Structured MCP / Skill discovery independent acceptance

Date: 2026-09-22 (Asia/Shanghai)

## Scope and evidence

- Worktree under test: `/Users/Max/Workspace/company/development/RDK_MCP/rdk-docs-mcp/.claude/worktrees/fix+skill-natural-language-quality`
- Read the tool-use sections of `skills/rdk-docs/SKILL.md` and the `search_skills` schema in `mcp/src/server.ts` only. The relevant contract was: the caller interprets intent first; `query` is short ranking text; use one `task` per call; preserve positive `platform` and explicit `exclude_platforms`; use `workflow=ptq|qat|undecided` only for model conversion; split compound camera/GPIO/UART and board comparisons; use official document search for hardware facts.
- Waited for `/tmp/rdk-structured-ready`; it appeared before testing.
- Raw MCP evidence, including every exact input, complete search result, complete `get_skill` result, exit code, stdout/stderr, and catalog metadata is in `2026-09-22-structured-caller-results.json`.
- No repository files were edited by this acceptance run. The worktree was already dirty with the implementation changes under review; those changes were left untouched.

## Independent routing decisions for all 18 tasks

The numbers below are the original array positions in `/tmp/rdk-independent-tasks.json`.

| Tasks | Independent decision | Structured calls / handling |
|---|---|---|
| 1 | Documentation only | X5 stereo CSI wiring/device tree/driver facts; no Skill call. Missing sensor and lane count remain clarification requirements. |
| 2 | Documentation only | S100 GPIO pinout, 3.3 V input, edge interrupt, pull-up and electrical limits; no Skill call. Do not claim hardware support from Skill metadata. |
| 3 | Documentation only | X3 UART3 RS-485 configuration/device node, with USB-serial excluded; no Skill call. |
| 4 | Skill workflow | `task=model_conversion`, `platform=x5`, `workflow=ptq`, query `X5 ONNX INT8 PTQ 校准 编译 部署`. |
| 5 | Skill workflow | `task=model_conversion`, `platform=s100`, `workflow=qat`, query `S100 PyTorch QAT 量化训练 部署`; QAT was preserved. |
| 6 | Skill lookup | `task=ready_model`, `platform=x3`, `exclude_platforms=[x5,s100]`, query `X3 现成目标检测模型 Model Zoo`. |
| 7 | Skill lookup | `task=ready_model`, `platform=x5`, query `X5 现成语义分割模型 Model Zoo`; existing-model lookup takes priority over a conversion fallback. |
| 8 | Skill workflow | `task=model_maintenance`, query `Model Zoo 模型库维护 提交修订 版本核对`; returned development and release candidates. |
| 9 | Skill workflow | `task=model_conversion`, `platform=s100`, `workflow=ptq`, query `S100 ONNX 自定义算子 PTQ 转换`; the explicit no-training/no-QAT constraint was retained. |
| 10 | Documentation only | X5 camera drop, capture path, bandwidth and debugging facts; no Skill call and no generic Linux recommendation. |
| 11 | Documentation only, split | Split into camera, GPIO-trigger and UART timestamp documentation subtasks; no Skill call. Missing sensor, trigger pin and UART port remain clarification requirements. |
| 12 | Skill lookup | Existing quantized Transformer from the official library is a `ready_model` lookup: `task=ready_model`, `platform=s100`, query `S100 现成量化 Transformer 模型库部署`. PTQ/QAT is not forced when looking for an existing artifact. |
| 13 | Documentation only | X3 GPIO input/pull-up API and pinmux facts; no Skill call. |
| 14 | Skill workflow | `task=model_conversion`, `platform=x5`, `workflow=undecided`, query `X5 TensorFlow SavedModel BPU 转换`; no PTQ/QAT was invented. |
| 15 | Skill lookup, split comparison | Two calls, one per board: `task=ready_model, platform=x3` with query `X3 检测模型 Model Zoo 部署`, then `task=ready_model, platform=x5` with query `X5 检测模型 Model Zoo 部署`. No multi-board target was sent in one call. |
| 16 | Documentation only | S100 1.8 V GPIO and 3.3 V relay/electrical-risk facts; no Skill call. No compatibility conclusion was inferred. |
| 17 | Skill workflow candidate | `task=model_maintenance`, query `维护 RDK 模型清单 版本 平台 量化状态 下载链接`. This is a workflow/source-maintenance request rather than a hardware fact; the returned candidates are Model Zoo maintenance/repository skills, so their scope must be confirmed before recommendation. |
| 18 | Documentation plus Skill split | Camera and GPIO portions are documentation-only; the existing pose-model portion is `task=ready_model`, `platform=x5`, query `X5 现成姿态模型 Model Zoo`. Sensor/model compiler constraints remain clarification requirements. |

## Actual search results

There were 12 `search_skills` calls because task 15 was split into two board-specific calls. All exited with code 0 and none returned an MCP `isError` result. Every returned candidate had `classification`, exact `name`, `display_name`, `source_url`, `install_type`, `catalog_revision`, and `fetched_at`.

| Original task | Returned candidates in rank order | Scope / constraint observation |
|---|---|---|
| 4 | `x5-ptq-deploy`; `x5-ptq-compile` | Both classified `model_conversion`, `ptq`, `x5`, `platform_scope=matched-board`. |
| 5 | `__SKILL_j6-plugin-__quantization`; `__SKILL_j6-plugin-__set-fake-quantize` | Both classified `model_conversion`, `qat`, and S-family (`s100`, `s100p`, `s600`), with `platform_scope=matched-board`. Exact names were retained; the human display name for the second is `j6-plugin-set-fake-quantize`. |
| 6 | `rdk-model-zoo` | The X3 target and X5/S100 exclusions were accepted in the input. The result's catalog classification has `platforms=null`, `platform_scope=unknown`; therefore it cannot prove X3-only compatibility and must not be presented as such. |
| 7 | `rdk-model-zoo` | `ready_model`/X5 input accepted; catalog platform scope is unknown, so the result does not establish that a particular segmentation model runs on X5. |
| 8 | `rdk-model-zoo-develop`; `rdk-model-zoo-release` | Both classified `model_maintenance`, `platform_scope=unconstrained`; development and release are distinct candidate workflows. |
| 9 | `hmct-workflow`; `j6-hbdk-compile` | Both classified `model_conversion`, `ptq`, S-family, `platform_scope=matched-board`. |
| 12 | `rdk-model-zoo` | `ready_model`/S100 input accepted; platform scope is unknown and no PTQ/QAT claim was made. |
| 14 | `x5-router` | `model_conversion`/X5 input accepted with `workflow=undecided`; `platform_scope=matched-board`. |
| 15 X3 | `rdk-model-zoo` | Board-specific X3 call succeeded; catalog platform scope remains unknown. |
| 15 X5 | `rdk-model-zoo` | Board-specific X5 call succeeded; catalog platform scope remains unknown. |
| 17 | `rdk-model-zoo-develop`; `rdk-model-zoo-repo` | Both classified `model_maintenance`, `platform_scope=unconstrained`; this is evidence of candidate discovery, not proof that either is the exact internal-list workflow. |
| 18 | `rdk-model-zoo` | `ready_model`/X5 input accepted; platform scope is unknown. |

## `get_skill` verification

For every search call, the first one or two ranked candidates were fetched by exact `name` (never by `display_name`). All 17 detail fetches exited with code 0, returned `isError` unset, and included a non-empty description plus structured installation guidance. Workspace candidates correctly returned the full pack handoff (`rdk-pack-installer`, project-root requirement, pack ref and `verify_paths`); flat candidates returned the `npx skills add` guidance. No installation or script execution was performed.

Examples of the returned detail constraints that must be preserved in any recommendation:

- `x5-ptq-deploy` explicitly covers the X5 OE Mapper PTQ flow and rejects Plugin QAT/S-series workflows.
- The S-family `__SKILL_j6-plugin-__quantization` detail describes the end-to-end quantization/QAT flow. `__SKILL_j6-plugin-__set-fake-quantize` is only a single state-setting step; it must not be presented as a complete QAT delivery or substituted for the workflow candidate.
- Similarly, `hmct-workflow` is the S-family PTQ workflow entry while `j6-hbdk-compile` is a compile step; `x5-ptq-deploy` is the X5 workflow entry while `x5-ptq-compile` is a compile step. Ranked results were fetched for verification, but the step entries are not equivalent full workflows.
- `rdk-model-zoo` is for ready-made model lookup and does not establish fresh hardware compatibility.
- `rdk-model-zoo-develop` and `rdk-model-zoo-release` have different maintenance/release scopes.
- `x5-router` is an X5 route entry and does not itself prove that a SavedModel conversion path is compatible with a particular Ubuntu/runtime/toolchain version.

## Snapshot and warnings

All calls reported the same `catalog_revision` `08d0a466413f11bbc045ba5e51f626bdb0346373` and `fetched_at` `2026-09-21T07:19:34.118Z`. This is catalog-snapshot evidence; this run does not claim a fresh GitHub fetch. Each smoke invocation emitted the stderr warning that refresh was skipped because `mcp/SKILL.md` was missing next to the package. Despite that warning, the MCP calls returned valid structured results with no tool errors. No live-refresh/HTTP failure was observed in this run.

## Acceptance outcome

Pass for the structured-calling contract exercised here: the caller independently routed documentation-only questions away from Skill discovery, preserved PTQ versus QAT and positive/excluded boards, used `undecided` only where the conversion workflow was genuinely unspecified, split compound/comparison tasks, used exact candidate names for detail retrieval, and did not treat unknown catalog platform scope as hardware compatibility. The seven documentation-only decisions are routing judgments only; they were not hardware fact checks, so unqueried pinouts, voltages, device nodes, bandwidth, compatibility, and final deployment claims cannot be counted as passed hardware answers. The report also rejects treating single-step candidates such as `set-fake-quantize` or `j6-hbdk-compile` as complete workflows.

## Final implementation replay by primary agent

Replayed the independent caller's exact 12 parameter sets after taxonomy role/BSP-scope corrections: 12 searches and 17 detail fetches passed. Automated checks confirmed every result's task and every explicit PTQ/QAT constraint. The original narrative detail count was corrected from 18 to 17 against the raw evidence. No hardware facts or installs were executed.

Final unit/protocol suite: 285 passed; TypeScript build passed; 57/57 documentation retrieval checks passed. npm dry-run includes structured search, taxonomy data and updated bundled Skill. Fresh-catalog live evaluation was blocked by GitHub HTTP 403 rate limiting; cached-snapshot success does not replace fresh-fetch verification.

Independent code review found one issue: fingerprinting omitted future catalog fields. Fixed with recursive canonical JSON over the complete record; a new-field drift test failed before the fix and passes now. Key-order invariance also passes. Final structured replay after this fix still passed 12 searches/17 detail fetches.
