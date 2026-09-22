# RDK Assistant MCP reliability design

The user requested a written plan followed immediately by stepwise implementation of the system-assessment fixes. This is approval to execute the described repair scope, without another design/plan approval round. The existing assessment and proposed three batches are the design basis.

## Purpose and boundaries

Deliver dependable official-document retrieval and Skill discovery. The caller interprets intent; MCP enforces explicit constraints and exposes evidence limitations. Do not introduce an LLM dependency, vector store, automatic skill execution, or guessed hardware compatibility. Preserve tool names, server configuration id `rdk-docs`, npm name/bin `rdk-docs-mcp`, and bundled skill paths. Use **RDK Assistant MCP** as the human-facing name and MCP implementation title. Prepare version **0.2.0**, without publishing or merging. Node >=20, existing dependencies only.

Three naming options were considered: keeping a docs-only title undersells discovery; immediately renaming npm/repository/configuration breaks installation assumptions; changing display title while retaining stable identifiers gives accurate positioning and compatible upgrades. This iteration chooses the third. A later package rename would require alias/deprecation migration and separate publication authorization.

## Required behavior

1. HTTP caches identify complete URLs using SHA-256, store one validated atomic envelope, reject malformed/future timestamps and URL mismatches, and never turn successful network reads into failures because persistence is unavailable. Legacy cache entries are cache misses. Installed Skill and JSON/DSH updates use atomic replacement; existing valid user config fields remain preserved.
2. Explicit single-board document queries exclude clearly other-board-only pages/families. General/shared pages survive. Board comparison queries keep per-board evidence. Page output distinguishes HTML, index recovery and forum; paginated reads include a content hash so changed content cannot silently splice pages. Images remain links, with evidence limitations visible.
3. A schema-validated Skill discovery model distinguishes task, workflow and role. Add `model_compile` and `network`; compilation does not force a PTQ/QAT decision. Accept optional upstream `discovery` metadata version 1 in the same catalog record/revision; retain reviewed fingerprint-bound overlay as compatibility adapter. Do not manufacture missing metadata or relax stale fingerprints. Emit missing/stale/invalid metadata coverage and `category_only` when lexical relevance is absent. Unknown board scope remains visible; exclusions constrain the target set, not the existence of multi-board documentation.
4. Existing get_skill summary remains compatible. Optional bounded content retrieval reads SKILL.md from the validated hub revision/path, identifies the source/hash and handles continuation and unavailability explicitly. Never execute returned instructions. Keep flat installer syntax if revision pinning is not independently verified; expose required post-install source verification instead of promising a pinned install.
5. `get_status` and `--doctor` report package/version/capabilities and catalog coverage/error state. They are read-only and do not trigger installed Skill refresh. Prefer advertised schemas/capability flags over version guesses. New server rejects unknown arguments for structured Skill tools where supported by the SDK. Old running servers cannot be repaired retroactively; installation guide must explain restart and probe.
6. Cross-platform prepack uses Node. Packaged artifact must include new capabilities and matching Skill guidance. CI/offline regression tests cover contract and boundary behaviors; live verification reports source/network limitations honestly. Successful retrieval is not proof of a correct final answer or hardware execution.

## Data contract and migration

`discovery` fields: `{schema_version:1,tasks:Task[],workflows:('ptq'|'qat')[],platforms:Platform[]|null,role:'entry'|'workflow'|'step'}`. Require nonempty tasks, unique enum arrays; reject malformed declared metadata for that record without falling back to old annotation. Caller output states whether evidence originates in catalog or reviewed overlay. The service does not modify rdk-skills in this iteration: support its future metadata now, document the exact producer contract and maintain observed coverage transparently. Partial coverage must not become an unqualified `no_match`.

Continuation contract shared by documents and Skill content: first request offset defaults to 0; following requests require `expected_content_hash`; mismatch fails rather than concatenates inconsistent content. Return `offset`, `next_offset`, `total_chars`, `content_hash`, `truncated`, and sliced text.

## Acceptance

- Cache collision, corrupt metadata, URL mismatch, future timestamp, unwritable directory, interrupted replacement regressions pass.
- `X3 摄像头` cannot return explicitly X5-only or S-family results as applicable; generic pages retained; comparison tests preserved.
- Missing/stale/invalid metadata are separately counted; upstream declared schema is validated; pure compile returns compile candidates without ambiguous_quant; category-only and unknown-scope evidence remain machine readable.
- Exact-name detail retains old summary shape and installation types; optional body uses the catalog SHA, is bounded, and rejects stale continuation.
- Server/client tool-schema tests, doctor with isolated HOME, full tests/build, packed-artifact smoke and independent review pass.
- No npm publication, merge, real client configuration replacement, or real hardware execution is implied by this implementation.
