import { describe, expect, it, vi } from "vitest";
import { getSkillDetail } from "./skill-service.js";
import type { CatalogResult } from "./skill-catalog.js";

const catalog: CatalogResult = {from_cache:false,warnings:[],snapshot:{schema:1,revision:"a".repeat(40),fetched_at:"2026-09-22T00:00:00Z",packs:[],skills:[{
  name:"camera",description:"Camera summary",pack:"Device",repo:"D-Robotics/rdk-device-skills",catalog_path:"skills/camera",install_type:"flat",
}]}};

describe("get_skill content integration",()=>{
  it("keeps summary default and retrieves source only when explicitly requested",async()=>{
    const fetchContent=vi.fn(async()=>"# Camera\nRequires the correct driver.");
    const deps={loadCatalog:async()=>catalog,fetchContent};
    const summary=await getSkillDetail({name:"camera"},deps);
    expect(summary).not.toHaveProperty("content");
    expect(fetchContent).not.toHaveBeenCalled();
    const detail=await getSkillDetail({name:"camera",include_content:true},deps);
    expect(fetchContent).toHaveBeenCalledOnce();
    expect(detail.content).toMatchObject({status:"available",markdown:"# Camera\nRequires the correct driver."});
    expect(detail.installation).toMatchObject({version_policy:"installer_default_not_catalog_pinned",verification:{required:true,catalog_revision:catalog.snapshot.revision}});
    expect(detail.metadata_evidence.status).toBe("missing");
  });

  it("reports unavailable content while preserving the exact catalog identity",async()=>{
    const output=await getSkillDetail({name:"camera",include_content:true},{loadCatalog:async()=>catalog,fetchContent:async()=>{throw new Error("rate limited");}});
    expect(output.name).toBe("camera");
    expect(output.content).toMatchObject({status:"unavailable"});
    expect(output.warnings.join(" ")).toMatch(/content_unavailable/);
  });

  it("rejects content parameters without include_content before loading catalog",async()=>{
    const loadCatalog=vi.fn(async()=>catalog);
    await expect(getSkillDetail({name:"camera",offset:1},{loadCatalog})).rejects.toThrow(/include_content/);
    expect(loadCatalog).not.toHaveBeenCalled();
  });
});
