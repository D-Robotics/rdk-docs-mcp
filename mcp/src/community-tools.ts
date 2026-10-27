import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CommunityBrowserLogin, SessionStore } from "./community-auth.js";
import { CommunityClient } from "./community-client.js";
import { CommunityPublisher, type PublishingBackend } from "./community-publishing.js";
import { CommunityError, kindSchema, publicationSchema } from "./community-types.js";

const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const writeAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
async function respond(run: () => unknown | Promise<unknown>) {
  try { return { content: [{ type: "text" as const, text: JSON.stringify(await run(), null, 2) }] }; }
  catch (error) {
    const detail = error instanceof CommunityError ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) }
      : error instanceof z.ZodError ? { code: "invalid_input", message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }
      : { code: "community_unavailable", message: "The operation could not complete. Check the local files, network and personal community login, then prepare a new preview if needed." };
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: detail }, null, 2) }], isError: true };
  }
}

export function registerCommunityTools(server: McpServer, options: { backend?: PublishingBackend; store?: SessionStore; login?: CommunityBrowserLogin } = {}) {
  const store = options.store ?? new SessionStore();
  const backend = options.backend ?? new CommunityClient({ session: () => store.load() });
  const publisher = new CommunityPublisher(backend); const login = options.login ?? new CommunityBrowserLogin(store);
  server.registerTool("community_account", {
    description: "Connect the MCP user's own community account. login opens a dedicated browser for the human to sign in; complete_login captures that session privately on this computer. status reports the actual community and forum identities; logout removes the local publishing credential file. Never request a password/token in chat or impersonate a named author. Interactive login requires agent-browser. A browser session and environment credentials are not revoked by local logout.",
    inputSchema: { action: z.enum(["status", "login", "complete_login", "logout"]).default("status") },
    annotations: writeAnnotations,
  }, ({ action }) => respond(async () => {
    if (action === "login") return login.start();
    if (action === "complete_login") return login.complete();
    if (action === "logout") { await store.clear(); return { local_credentials_removed: true, message: "The browser and externally configured environment credentials remain unchanged." }; }
    const community = await backend.account("case");
    try { return { community, forum: await backend.account("forum_post") }; }
    catch (error) { return { community, forum: null, forum_status: error instanceof CommunityError ? error.code : "unavailable" }; }
  }));
  server.registerTool("prepare_community_publish", {
    description: "Prepare a local preview for a case, Skill or forum post; this does NOT upload or publish. Show the human the full content, author, target, files and agreements before asking for confirmation. Cases use a public GitHub repository README, a local JPG/PNG/WebP cover, and optional Bilibili embed. category_codes: 1 LLM, 2 integrated, 3 perception, 4 HCI, 5 peripherals, 6 competitions, 7 RL; platform_codes: 1 X3, 2 X5, 3 S100, 4 S600, 5 other. Skills require a ZIP containing SKILL.md (max 50 MiB); omitted icons use the first community preset, shown in this preview. Forum attachments use {{attachment:0}} markers or are appended. A new MCP session, changed file, content or signed-in user requires a new preview.",
    inputSchema: { content: publicationSchema }, annotations: readAnnotations,
  }, ({ content }) => respond(() => publisher.prepare(content)));
  for (const [name, kind] of [["publish_case", "case"], ["publish_skill", "skill"], ["publish_forum_post", "forum_post"]] as const) {
    server.registerTool(name, {
      description: `Publish the exact saved ${kind} preview as the signed-in user. Call only AFTER the human explicitly confirmed that preview and destination. ${kind !== "forum_post" ? "The human must also accept all open-source, distribution and originality statements shown in agreements; set accepted_open_source_license only after that acceptance. " : ""}This creates real community content. Return the actual link/review state; submitted or pending_review does not mean published. Do not retry an ambiguous write or silently submit under another account.`,
      inputSchema: {
        confirmation_id: z.string().uuid(), confirmed: z.boolean(),
        ...(kind !== "forum_post" ? { accepted_open_source_license: z.boolean() } : {}),
      }, annotations: writeAnnotations,
    }, (input) => respond(() => publisher.publish(kind, input.confirmation_id, input.confirmed, "accepted_open_source_license" in input && input.accepted_open_source_license === true)));
  }
  server.registerTool("get_publication_status", {
    description: "Read the actual status of a submitted case, Skill or forum topic. Case/Skill ownership is checked by the community using the user's own session. Report review failures and pending states exactly; this does not publish, edit or retry a submission.",
    inputSchema: { kind: kindSchema, id: z.number().int().positive() }, annotations: readAnnotations,
  }, ({ kind, id }) => respond(() => backend.status(kind, id)));
}
