import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listManuals } from "./catalog.js";
import { fetchText } from "./http.js";
import { getPage, listToc, searchDocs } from "./service.js";

/** Single source of truth for the advertised version: the package itself. */
export const PACKAGE_VERSION = (() => {
  try {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { version?: string };
    return parsed.version && typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
})();

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "rdk-docs",
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    "list_manuals",
    {
      description:
        "List official RDK manuals only. Community forum content is not in this catalog; use search_docs with source=forum when the user asks for community experience.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(
          listManuals().map((manual) => ({
            id: manual.id,
            title: manual.title,
            category: manual.category,
            description: manual.description,
            homeUrl: manual.homeUrl,
            searchable: manual.searchable,
            aliases: manual.aliases,
          })),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "search_docs",
    {
      description:
        "Search RDK sources through MCP. Default source is docs (official manuals only). Use source=forum or manual=forum for community experience; use source=all only when the user explicitly asks for community/forum input. manual=forum is a compatibility alias for source=forum. If evidence is insufficient, report that without inferring support or lack of support. Keep different product models separate, preserve version labels, and ask for missing parameters before searching.",
      inputSchema: {
        query: z.string().describe("Chinese or English search keywords"),
        manual: z
          .string()
          .optional()
          .describe("Manual id or alias, e.g. rdk-x, x5, tros, studio"),
        source: z
          .enum(["docs", "forum", "all"])
          .optional()
          .describe("docs = manuals only; forum = community only; all = docs first, forum as supplement"),
        limit: z.number().int().min(1).max(20).optional().describe("Max hits, default 8"),
      },
    },
    async ({ query, manual, source, limit }) => {
        try {
          return ok(await searchDocs({ query, manual, source, limit }, fetchText));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_page",
    {
      description:
        "Fetch one official RDK documentation page or public community forum topic as Markdown. Prefer URLs returned by search_docs; forum content is read-only community experience, not official documentation.",
      inputSchema: {
        url: z
          .string()
          .describe(
            "URL returned by search_docs: official documentation on developer.d-robotics.cc or a public read-only forum topic on forum.d-robotics.cc",
          ),
        maxChars: z.number().int().min(1000).max(40000).optional(),
      },
    },
    async ({ url, maxChars }) => {
      try {
        return ok(await getPage({ url, maxChars }, fetchText));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "list_toc",
    {
      description:
        "List pages in one official RDK manual.",
      inputSchema: {
        manual: z.string().describe("Manual id or alias, e.g. rdk-x, rdk-s, tros"),
        query: z.string().optional().describe("Optional title filter"),
      },
    },
    async ({ manual, query }) => {
      try {
        return ok(await listToc({ manual, query }, fetchText));
      } catch (error) {
        return fail(error);
      }
    },
  );

  return server;
}
