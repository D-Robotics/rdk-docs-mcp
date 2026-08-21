import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listManuals } from "./catalog.js";
import { forumListing } from "./forum.js";
import { fetchText } from "./http.js";
import { getPage, listToc, searchDocs } from "./service.js";

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
    version: "0.1.1",
  });

  server.registerTool(
    "list_manuals",
    {
      description:
        "List official RDK manuals (primary). The community forum is appended as id=forum for supplementary lookup only.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(
          [
            ...listManuals().map((manual) => ({
              id: manual.id,
              title: manual.title,
              category: manual.category,
              description: manual.description,
              homeUrl: manual.homeUrl,
              searchable: manual.searchable,
              aliases: manual.aliases,
            })),
            forumListing(),
          ],
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
        "Search official RDK manuals first. A named manual searches that book only. With no manual, results are docs-majority and at most a few forum hits as supplement. Use source=forum or manual=forum only when official docs are missing.",
      inputSchema: {
        query: z.string().describe("Chinese or English search keywords"),
        manual: z
          .string()
          .optional()
          .describe("Manual id or alias, e.g. rdk-x, x5, tros, studio, forum"),
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
        "Fetch one official doc page (preferred) or a forum topic as Markdown. Prefer official URLs; treat forum as supplementary.",
      inputSchema: {
        url: z
          .string()
          .describe("developer.d-robotics.cc doc URL/path or forum.d-robotics.cc topic URL"),
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
        "List pages in one official RDK manual. Use manual=forum only as a supplement to list recent 开发与问题 / 通用 topics.",
      inputSchema: {
        manual: z.string().describe("Manual id or alias, or forum"),
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
