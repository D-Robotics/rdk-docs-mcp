import { describe, expect, it, vi } from "vitest";
import { getStatus } from "./status.js";
import { SkillError, type CatalogResult } from "./skill-catalog.js";

describe("read-only capability diagnostics", () => {
  it("reports stable identifiers and new features without loading the catalog by default", async () => {
    const loadCatalog = vi.fn();
    const status = await getStatus({}, { loadCatalog });
    expect(loadCatalog).not.toHaveBeenCalled();
    expect(status.display_name).toBe("RDK Assistant MCP");
    expect(status.package_name).toBe("rdk-docs-mcp");
    expect(status.server_id).toBe("rdk-docs");
    expect(status.version).toBe("0.2.0");
    expect(status.capabilities.structured_skill_search).toBe(true);
    expect(status.capabilities.skill_content).toBe(true);
    expect(status.capabilities.document_continuation).toBe(true);
    expect(status.tasks).toContain("model_compile");
    expect(status.catalog.status).toBe("not_checked");
  });

  it("keeps capabilities visible when an explicitly requested catalog check fails", async () => {
    const status = await getStatus({ check_catalog: true }, {
      loadCatalog: async () => { throw new SkillError("catalog_unavailable", "HTTP 403 rate limit"); },
    });
    expect(status.capabilities.structured_skill_search).toBe(true);
    expect(status.catalog).toMatchObject({status:"unavailable", error:{code:"catalog_unavailable"}});
  });

  it("reports catalog revision, cache provenance and metadata coverage", async () => {
    const catalog: CatalogResult = {warnings:[],from_cache:true,snapshot:{schema:1,revision:"a".repeat(40),fetched_at:"2026-09-22T00:00:00Z",skills:[],packs:[]}};
    const status = await getStatus({check_catalog:true}, {loadCatalog:async()=>catalog});
    expect(status.catalog).toMatchObject({status:"available",revision:catalog.snapshot.revision,from_cache:true,metadata_health:{total:0,classified:0}});
  });
});
