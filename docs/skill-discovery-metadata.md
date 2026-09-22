# Skill discovery metadata contract (version 1)

The catalog producer can add a `discovery` object to each existing skill-index record. MCP reads it from the same SHA as the record, source path and pack registry. This contract is supported by RDK Assistant MCP 0.2.0; upstream adoption is separate from this MCP release.

```json
{
  "name": "example-compile",
  "description": "Compile an already prepared artifact; consult the source for input formats.",
  "pack": "Example",
  "repo": "D-Robotics/example",
  "catalog_path": "skills/example-compile",
  "install_type": "flat",
  "discovery": {
    "schema_version": 1,
    "tasks": ["model_compile"],
    "workflows": [],
    "platforms": ["x5"],
    "role": "step"
  }
}
```

The example illustrates the schema, not an installable Skill or proven artifact compatibility.

- `tasks` is nonempty and unique: camera, gpio, uart, ready_model, model_conversion, model_compile, model_deploy, model_maintenance, environment, network, diagnostics, bsp.
- `workflows` contains unique ptq/qat values, or is empty. Pure compilation need not select a quantization workflow. If workflow-specific prerequisites exist, document them in the source and metadata.
- `platforms` is a nonempty unique array from x3/x5/s100/s100p/s600/ultra, or null when unknown. It describes search scope, not a compatibility certification.
- `role` is entry, workflow or step. An entry selects a workflow; a workflow coordinates a complete task; a step implements a bounded operation.
- The producer reviews labels against the Skill's full source. CI should validate the schema, named paths and coverage before publishing the catalog revision. Do not auto-label broad applicability from a keyword appearing only in an exclusion.

If `discovery` is absent, MCP may use its reviewed fingerprint-bound overlay. If present but invalid, it is not silently replaced by that overlay. If the source record changes, an old overlay classification is stale and excluded from strict results. `metadata_health` distinguishes classified, missing, stale and invalid records; unknown_platform counts classified records without reviewed platform scope. Partial coverage is not proof of absence.

Search callers should inspect candidate metadata origin and scope, and read `get_skill(include_content=true)` before judging prerequisites. A `category_only` result means the category matched but query terms did not. It is a navigation aid, not evidence that the user's exact task is covered.

`platform` selects a target. `exclude_platforms` removes targets: a Skill documented for both X3 and X5 may still serve an X5 target that excludes X3. Without a target, candidates whose known scope contains no remaining allowed platform are excluded. Unknown scope is retained as unknown and must not become a compatibility claim.

Install guidance continues to distinguish the hub catalog SHA, Skill source SHA, and workspace pack ref. Flat `npx skills add` currently follows installer defaults; verify actual installed source and version rather than asserting it is pinned to the catalog.
