import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunityPublisher, type PublishingBackend } from "./community-publishing.js";

const account = { id: "user-1", username: "alice" };
const forum = { kind: "forum_post" as const, title: "My RDK project", markdown: "A working camera demo.", category_id: 40, tags: [], attachments: [] };
function backend(): PublishingBackend {
  return { account: vi.fn(async () => account), submit: vi.fn(async () => ({ kind: "forum_post", id: 10, status: "published", url: "https://forum.d-robotics.cc/t/topic/10" })), status: vi.fn() };
}
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe("community publication confirmation", () => {
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
