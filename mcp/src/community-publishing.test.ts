import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { mkdtemp, writeFile, rm, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SessionStore } from "./community-auth.js";
import { registerCommunityTools } from "./community-tools.js";
import { CommunityPublisher, type PublishingBackend } from "./community-publishing.js";

const fileAccess = vi.hoisted(() => ({ reads: [] as string[] }));
vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original, readFile: vi.fn(original.readFile),
    open: vi.fn(async (path: string, flags: string, mode?: number) => {
      const handle = await original.open(path, flags, mode);
      const read = handle.read.bind(handle);
      handle.read = ((...args: Parameters<typeof read>) => {
        fileAccess.reads.push(path);
        return read(...args);
      }) as typeof handle.read;
      return handle;
    }),
  };
});

const account = { id: "user-1", username: "alice" };
const forum = { kind: "forum_post" as const, title: "My RDK project", markdown: "A working camera demo.", category_id: 40, tags: [], attachments: [] };
const caseInput = { kind: "case" as const, project_name: "Project", summary: "Example", category_codes: [2], platform_codes: [2],
  repository_url: "https://github.com/example/project" };
const skill = { kind: "skill" as const, display_name: "Example", description: "Example skill", category: "TESTING" as const,
  developer_signature: "Author", contact_email: "author@example.com", version: "1.0.0" };
// A real deflated ZIP produced independently of the archive parser.
const skillZip = Buffer.from("UEsDBBQAAAAIANluY12R7PPQGwAAABsAAAAPAAAAYnVuZGxlL1NLSUxMLm1kU1ZwrUjMLchJ5XIrzclRKM7OBJIlqRUlelwAUEsDBBQAAAAIANluY10H7v1xEQAAAA8AAAAYAAAAYnVuZGxlL3NjcmlwdHMvaGVscGVyLmpzS87PK87PSdXLyU/XMNTkAgBQSwECFAMUAAAACADZbmNdkezz0BsAAAAbAAAADwAAAAAAAAAAAAAAgAEAAAAAYnVuZGxlL1NLSUxMLm1kUEsBAhQDFAAAAAgA2W5jXQfu/XERAAAADwAAABgAAAAAAAAAAAAAAIABSAAAAGJ1bmRsZS9zY3JpcHRzL2hlbHBlci5qc1BLBQYAAAAAAgACAIMAAACPAAAAAAA=", "base64");
const imageFixtures = {
  png: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAE0lEQVR4nGP8+/cvAwMDCwMYAAAjzAL962fXNwAAAABJRU5ErkJggg==",
  jpeg: "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAIAAgMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z",
  webp: "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAgA0JaQAA3AA/vtdAAA=",
};
function backend(): PublishingBackend {
  return { account: vi.fn(async () => account), submit: vi.fn(async () => ({ kind: "forum_post", id: 10, status: "published", url: "https://forum.d-robotics.cc/t/topic/10" })), status: vi.fn() };
}
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe("community publication confirmation", () => {
  it("rejects a text file disguised as a Skill ZIP without submitting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, "invalid.zip"); await writeFile(path, "not a zip");
    const api = backend(); const publisher = new CommunityPublisher(api);
    await expect(publisher.prepare({ ...skill, package_path: path })).rejects.toMatchObject({ code: "invalid_file" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("shows the complete nested SKILL.md and member list bound to the package hash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, "skill.zip"); await writeFile(path, skillZip);
    fileAccess.reads.length = 0;
    const api = backend(); const preview = await new CommunityPublisher(api).prepare({ ...skill, package_path: path });
    expect(fileAccess.reads).toContain(path);
    expect(preview.skill_archive).toEqual({
      skill_path: "bundle/SKILL.md", skill_content: "# Example\nFull skill text.\n",
      entries: ["bundle/SKILL.md", "bundle/scripts/helper.js"],
    });
    expect(preview.files[0].sha256).toBe(createHash("sha256").update(skillZip).digest("hex"));
    expect(api.submit).not.toHaveBeenCalled();
  });
  it.each([
    ["cover.png", Buffer.from("not an image"), "case"],
    ["cover.jpg", Buffer.from("89504e470d0a1a0a00000000", "hex"), "case"],
    ["cover.webp", Buffer.from("RIFFxxxxNOPE"), "case"],
    ["cover.webp", Buffer.from("d2c9c6c600000000d7c5c2d0", "hex"), "case"],
    ["icon.png", Buffer.from("not an image"), "skill"],
  ] as const)("rejects forged or mismatched image %s", async (name, bytes, kind) => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const image = join(dir, name); const packagePath = join(dir, "skill.zip");
    await writeFile(image, bytes); await writeFile(packagePath, skillZip);
    const api = backend(); const publisher = new CommunityPublisher(api);
    const input = kind === "case" ? { ...caseInput, cover_path: image } : { ...skill, package_path: packagePath, icon_path: image };
    await expect(publisher.prepare(input)).rejects.toMatchObject({ code: "invalid_file" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it.each([
    ["cover.png", 10 * 1024 ** 2 + 1, "case"],
    ["skill.zip", 50 * 1024 ** 2 + 1, "skill"],
    ["icon.png", 2 * 1024 ** 2 + 1, "icon"],
  ] as const)("rejects oversized %s before reading its contents", async (name, size, kind) => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, name); await writeFile(path, "x"); await truncate(path, size);
    const reader = vi.mocked(fs.readFile); reader.mockClear(); fileAccess.reads.length = 0;
    const api = backend(); const publisher = new CommunityPublisher(api);
    const packagePath = join(dir, "package.zip");
    if (kind === "icon") await writeFile(packagePath, skillZip);
    const input = kind === "case" ? { ...caseInput, cover_path: path }
      : kind === "icon" ? { ...skill, package_path: packagePath, icon_path: path } : { ...skill, package_path: path };
    await expect(publisher.prepare(input)).rejects.toMatchObject({ code: "invalid_file" });
    expect(reader).not.toHaveBeenCalledWith(path);
    expect(fileAccess.reads).not.toContain(path);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("tells MCP clients what the preview does and does not review", async () => {
    const api = backend(); const server = new McpServer({ name: "preview-test", version: "1" });
    registerCommunityTools(server, { backend: api, store: new SessionStore(join(tmpdir(), "unused-test-session"), {}) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "preview-test-client", version: "1" }, { capabilities: {} });
    await Promise.all([client.connect(a), server.connect(b)]);
    try {
      const description = (await client.listTools()).tools.find(tool => tool.name === "prepare_community_publish")!.description!;
      expect(description).toMatch(/other.*not.*reviewed/i);
      expect(description).toMatch(/image.*signature.*not.*decod/i);
      expect(description).toContain("1000");
    } finally { await client.close(); await server.close(); }
  });
  it("marks unreviewed archive members and limited image inspection in the preview", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const packagePath = join(dir, "skill.zip"); const icon = join(dir, "icon.png");
    await writeFile(packagePath, skillZip); await writeFile(icon, Buffer.from("89504e470d0a1a0a", "hex"));
    const preview = await new CommunityPublisher(backend()).prepare({ ...skill, package_path: packagePath, icon_path: icon });
    expect(preview.notices).toEqual(expect.arrayContaining([
      expect.stringMatching(/other.*not.*reviewed/i), expect.stringMatching(/signature.*not.*decoded/i),
    ]));
  });
  it.each([
    ["cover.PNG", imageFixtures.png], ["cover.jpg", imageFixtures.jpeg],
    ["cover.jpeg", imageFixtures.jpeg], ["cover.webp", imageFixtures.webp],
  ])("accepts a genuine image signature for %s", async (name, base64) => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, name); await writeFile(path, Buffer.from(base64, "base64"));
    const preview = await new CommunityPublisher(backend()).prepare({ ...caseInput, cover_path: path });
    expect(preview.files[0].name).toBe(name);
    expect(preview.notices).toEqual(expect.arrayContaining([expect.stringMatching(/not decoded/i)]));
  });
  it("binds the Skill ZIP bytes to the preview and keeps confirmation and agreement gates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, "skill.zip"); await writeFile(path, skillZip);
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare({ ...skill, package_path: path });
    await expect(publisher.publish("skill", preview.confirmation_id, false, false)).rejects.toMatchObject({ code: "confirmation_required" });
    await expect(publisher.publish("skill", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "agreement_required" });
    const changed = Buffer.from(skillZip); changed[45] ^= 1; await writeFile(path, changed);
    await expect(publisher.publish("skill", preview.confirmation_id, true, true)).rejects.toMatchObject({ code: "file_changed" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("rejects a package that grew after preview before reading it again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, "skill.zip"); await writeFile(path, skillZip);
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare({ ...skill, package_path: path });
    await truncate(path, 50 * 1024 ** 2 + 1); fileAccess.reads.length = 0;
    await expect(publisher.publish("skill", preview.confirmation_id, true, true)).rejects.toMatchObject({ code: "file_changed" });
    expect(fileAccess.reads).not.toContain(path); expect(api.submit).not.toHaveBeenCalled();
  });
  it("returns a complete Skill preview through MCP without submitting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const path = join(dir, "skill.zip"); await writeFile(path, skillZip);
    const api = backend(); const server = new McpServer({ name: "preview-test", version: "1" });
    registerCommunityTools(server, { backend: api, store: new SessionStore(join(dir, "unused-session"), {}) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "preview-test-client", version: "1" }, { capabilities: {} });
    await Promise.all([client.connect(a), server.connect(b)]);
    try {
      const response = await client.callTool({ name: "prepare_community_publish", arguments: { content: { ...skill, package_path: path } } });
      expect(response.isError).not.toBe(true);
      const preview = JSON.parse((response.content as Array<{ type: string; text: string }>)[0].text);
      expect(preview.skill_archive.skill_content).toBe("# Example\nFull skill text.\n");
      expect(preview.skill_archive.entries).toEqual(["bundle/SKILL.md", "bundle/scripts/helper.js"]);
      expect(preview.notices[0]).toMatch(/other.*not.*reviewed/i);
      expect(preview.files[0].sha256).toBe(createHash("sha256").update(skillZip).digest("hex"));
      expect(api.submit).not.toHaveBeenCalled();
    } finally { await client.close(); await server.close(); }
  });
  it("previews the exact author, content and target without submitting", async () => {
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare(forum);
    expect(preview.author).toEqual(account);
    expect(preview.content).toMatchObject({ title: forum.title, markdown: forum.markdown });
    expect(preview.confirmation_id).toEqual(expect.any(String));
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before any publication", async () => {
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare(forum);
    await expect(publisher.publish("forum_post", preview.confirmation_id, false, false)).rejects.toMatchObject({ code: "confirmation_required" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("binds the kind and prevents a different logged-in user from publishing the preview", async () => {
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare(forum);
    await expect(publisher.publish("case", preview.confirmation_id, true, true)).rejects.toMatchObject({ code: "preview_mismatch" });
    vi.mocked(api.account).mockResolvedValue({ id: "user-2", username: "bob" });
    await expect(publisher.publish("forum_post", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "account_changed" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("keeps a snapshot of the preview and does not submit twice", async () => {
    const api = backend(); const publisher = new CommunityPublisher(api);
    const input = { ...forum }; const preview = await publisher.prepare(input);
    input.markdown = "changed after preview";
    const first = await publisher.publish("forum_post", preview.confirmation_id, true, false);
    expect(await publisher.publish("forum_post", preview.confirmation_id, true, false)).toEqual(first);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.submit).mock.calls[0][0].content.markdown).toBe(forum.markdown);
  });
  it("detects attachments changed after the user's preview", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-publish-test-")); dirs.push(dir);
    const file = join(dir, "demo.png"); await writeFile(file, "first image");
    const api = backend(); const publisher = new CommunityPublisher(api);
    const preview = await publisher.prepare({ ...forum, markdown: "{{attachment:0}}", attachments: [file] });
    expect(preview.files[0]).toMatchObject({ name: "demo.png", bytes: 11 });
    await writeFile(file, "second image");
    await expect(publisher.publish("forum_post", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "file_changed" });
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("does not blindly retry when a write may have reached the server", async () => {
    const api = backend(); vi.mocked(api.submit).mockRejectedValue(new Error("connection lost"));
    const publisher = new CommunityPublisher(api); const preview = await publisher.prepare(forum);
    await expect(publisher.publish("forum_post", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "submission_failed" });
    await expect(publisher.publish("forum_post", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "already_attempted" });
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it("prevents concurrent calls from submitting the same confirmation twice", async () => {
    const api = backend(); let finish!: (value: any) => void;
    vi.mocked(api.submit).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const publisher = new CommunityPublisher(api); const preview = await publisher.prepare(forum);
    const first = publisher.publish("forum_post", preview.confirmation_id, true, false);
    await vi.waitFor(() => expect(api.submit).toHaveBeenCalledTimes(1));
    await expect(publisher.publish("forum_post", preview.confirmation_id, true, false)).rejects.toMatchObject({ code: "already_attempted" });
    finish({ kind: "forum_post", id: 10, status: "published", url: "https://forum.d-robotics.cc/t/topic/10" });
    await first;
  });
});
