import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";
import type { PublishingBackend } from "./community-publishing.js";

async function connect() {
  const backend: PublishingBackend = { account: vi.fn(async () => ({ id: "user-1", username: "alice" })), submit: vi.fn(async () => ({ kind: "forum_post", id: 10, status: "published", url: "https://forum.d-robotics.cc/t/topic/10" })), status: vi.fn(async () => ({ kind: "skill", id: 15, status: "pending_review", url: null })) };
  const server = createServer({ publishingBackend: backend });
  const [a, b] = InMemoryTransport.createLinkedPair(); const client = new Client({ name: "publishing-test", version: "1" }, { capabilities: {} });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, backend, close: async () => { await client.close(); await server.close(); } };
}
function data(result: any) { return JSON.parse(result.content.find((x: any) => x.type === "text").text); }
describe("community tools through MCP", () => {
  it("adds the three publishers and their required helpers while keeping all six read tools", async () => {
    const { client, close } = await connect();
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map(t => t.name)).toEqual(expect.arrayContaining(["search_docs", "get_page", "search_skills", "get_skill", "list_manuals", "list_toc", "community_account", "prepare_community_publish", "publish_case", "publish_skill", "publish_forum_post", "get_publication_status"]));
      for (const name of ["publish_case", "publish_skill", "publish_forum_post"]) {
        const tool = tools.find(t => t.name === name)!;
        expect(tool.annotations?.readOnlyHint).toBe(false);
        expect(tool.inputSchema.properties).not.toHaveProperty("author");
        expect(tool.inputSchema.properties).not.toHaveProperty("token");
      }
    } finally { await close(); }
  });
  it("previews first, requires user confirmation and submits the saved content", async () => {
    const { client, backend, close } = await connect();
    try {
      const preview = data(await client.callTool({ name: "prepare_community_publish", arguments: { content: { kind: "forum_post", title: "RDK camera", markdown: "My working demo", category_id: 40 } } }));
      expect(preview.author.username).toBe("alice"); expect(backend.submit).not.toHaveBeenCalled();
      const rejected = await client.callTool({ name: "publish_forum_post", arguments: { confirmation_id: preview.confirmation_id, confirmed: false } });
      expect(rejected.isError).toBe(true); expect(data(rejected).error.code).toBe("confirmation_required");
      const result = data(await client.callTool({ name: "publish_forum_post", arguments: { confirmation_id: preview.confirmation_id, confirmed: true } }));
      expect(result.status).toBe("published"); expect(backend.submit).toHaveBeenCalledTimes(1);
    } finally { await close(); }
  });
  it("returns actual review status instead of marking submitted Skills published", async () => {
    const { client, close } = await connect();
    try { const result = data(await client.callTool({ name: "get_publication_status", arguments: { kind: "skill", id: 15 } })); expect(result.status).toBe("pending_review"); }
    finally { await close(); }
  });
});
