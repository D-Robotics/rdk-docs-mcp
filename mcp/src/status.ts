import { loadSkillCatalog, SkillError, type CatalogResult } from "./skill-catalog.js";
import { metadataHealth } from "./skill-metadata.js";
import { TASKS, PLATFORMS } from "./skill-structured.js";
import { CAPABILITY_SCHEMA_VERSION, DISPLAY_NAME, PACKAGE_NAME, PACKAGE_VERSION, SERVER_ID } from "./version.js";

type CatalogStatus =
  | { status: "not_checked" }
  | { status: "unavailable"; error: { code: string; message: string } }
  | { status: "available"; revision: string; fetched_at: string; from_cache: boolean; warnings: string[]; metadata_health: ReturnType<typeof metadataHealth> };

/** This probe never refreshes installed Skills or writes client configuration. */
export async function getStatus(
  input: { check_catalog?: boolean } = {},
  deps: { loadCatalog?: () => Promise<CatalogResult> } = {},
) {
  let catalog: CatalogStatus = { status: "not_checked" };
  if (input.check_catalog) {
    try {
      const result = await (deps.loadCatalog ?? loadSkillCatalog)();
      catalog = {
        status: "available", revision: result.snapshot.revision,
        fetched_at: result.snapshot.fetched_at, from_cache: result.from_cache,
        warnings: result.warnings, metadata_health: metadataHealth(result.snapshot.skills),
      };
    } catch (error) {
      catalog = { status: "unavailable", error: {
        code: error instanceof SkillError ? error.code : "catalog_unavailable",
        message: error instanceof Error ? error.message : String(error),
      } };
    }
  }
  return {
    display_name: DISPLAY_NAME, package_name: PACKAGE_NAME, server_id: SERVER_ID,
    version: PACKAGE_VERSION, capability_schema_version: CAPABILITY_SCHEMA_VERSION,
    capabilities: {
      structured_skill_search: true, skill_metadata_health: true, skill_content: true,
      document_continuation: true, strict_skill_arguments: true,
      automatic_skill_execution: false,
    },
    tasks: TASKS, platforms: PLATFORMS, catalog,
    guidance: "Inspect the connected server's tools/list schema. This version identifies this process, not a different installed or already-running server. Restart the configured server after updating. Catalog presence does not mean installed Skill or verified hardware compatibility.",
  };
}
