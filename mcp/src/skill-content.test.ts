import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSkillText, readSkillContent, MAX_SKILL_BYTES } from "./skill-content.js";
import type { SkillCatalogSnapshot, SkillRecord } from "./skill-catalog.js";

const skill: SkillRecord = {name:"camera",description:"Camera setup",pack:"Device",repo:"D-Robotics/rdk-device-skills",catalog_path:"skills/camera",install_type:"flat"};
const snapshot: SkillCatalogSnapshot = {schema:1,revision:"a".repeat(40),fetched_at:"2026-09-22T00:00:00Z",skills:[skill],packs:[]};
afterEach(()=>vi.unstubAllGlobals());

describe("revision-bound Skill content", () => {
  it("fetches the hub revision and supports consistent continuation", async () => {
    const http = vi.fn(async()=>"a".repeat(1000)+"remaining");
    const first = await readSkillContent(snapshot, skill, {max_chars:1000}, http);
    expect(http).toHaveBeenCalledWith(`https://raw.githubusercontent.com/D-Robotics/rdk-skills/${snapshot.revision}/skills/camera/SKILL.md`);
    expect(first.status).toBe("available");
    if(first.status!=="available") throw new Error("Expected content");
    expect(first.next_offset).toBe(1000);
    const second = await readSkillContent(snapshot, skill, {offset:1000,expected_content_hash:first.content_hash},http);
    expect(second).toMatchObject({status:"available",markdown:"remaining",next_offset:null});
    await expect(readSkillContent(snapshot,skill,{offset:1000,expected_content_hash:first.content_hash},async()=>"changed")).rejects.toThrow();
  });

  it("keeps content failure explicit and does not substitute the catalog summary", async () => {
    const output = await readSkillContent(snapshot, skill, {}, async()=>{throw new Error("HTTP 404");});
    expect(output).toMatchObject({status:"unavailable",error:{code:"content_unavailable",message:"HTTP 404"}});
    expect(output).not.toHaveProperty("markdown");
  });

  it("rejects bad continuation input before fetching", async () => {
    const http = vi.fn(async()=>"text");
    await expect(readSkillContent(snapshot,skill,{offset:10},http)).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });

  it("bounds HTTP bodies even when the server omits Content-Length", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("a".repeat(MAX_SKILL_BYTES+1))));
    await expect(fetchSkillText("https://raw.githubusercontent.com/D-Robotics/rdk-skills/a/skills/x/SKILL.md")).rejects.toThrow(/limit/i);
  });

  it("rejects failed HTTP responses and blank content", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("not found",{status:404})));
    await expect(fetchSkillText("https://raw.githubusercontent.com/D-Robotics/rdk-skills/a/skills/x/SKILL.md")).rejects.toThrow(/404/);
    expect(await readSkillContent(snapshot,skill,{},async()=>"  ")).toMatchObject({status:"unavailable"});
  });
});
