# Structured Skill Discovery

Approved direction: calling model interprets user intent; MCP checks catalog constraints. This supersedes the natural-language parser as the preferred interface. PR #8 remains the delivery branch; no merge or npm publishing is authorized here.

## Contract

- search_skills accepts a task enum, explicit target platform, exclusions, and workflow. One task and target per call; caller splits compound/comparison requests.
- query only ranks eligible records; it never determines constraints in structured mode.
- Explicit workflow is valid only for model_conversion. Missing workflow means undecided: return entry records only and clarification guidance. ready_model and model_maintenance do not imply running quantization.
- Classification is a reviewed local overlay keyed by canonical identity, with source URLs and full-record SHA256 fingerprints. It is not installed state or hardware compatibility. Unknown/changed records do not enter a strict task result set.
- Query-only legacy behavior remains compatible and warns that it is candidate retrieval, not intent understanding. Do not add new natural-language patches to that path. Future removal needs an explicit breaking migration.
- Structured search/get_skill expose the same classification; canonical names and installation stay unchanged.

## Implemented steps

- [x] Add taxonomy data and invalidate it on record drift.
- [x] Add structured query implementation and validate incompatible arguments.
- [x] Wire service and MCP schemas; update caller skill and README.
- [x] Add deterministic tests including exclusions, task leakage, workflow scope, drift, exact-name constraint bypass, and protocol roundtrip.
- [x] Add live catalog checks.
- [x] Independent model chooses tool calls from the original 18 tasks and verifies actual results/details.
- [x] Final review and update original PR.

## Maintenance

The source catalog has no supported task/platform fields today. The local overlay makes this PR self-contained; no speculative schema changes or upstream PR are necessary. On catalog drift, review the new source record, update tasks/workflows/scope/role and fingerprint together, and run fixture and live checks. New skills remain unclassified until reviewed. A future upstream schema can replace the overlay with schema-validated metadata; do not silently infer metadata from arbitrary descriptions.

## Evaluation boundaries

Unit/protocol tests prove constraint execution. Independent caller evaluation checks interpretation, splitting, actual retrieval and get_skill. Neither proves physical board compatibility or execution of returned installation commands. Hardware factual questions must use official docs; recommending a skill is not evidence of voltage limits or successful model deployment.
