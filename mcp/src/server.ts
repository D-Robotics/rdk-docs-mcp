import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listManuals } from "./catalog.js";
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
    version: "0.1.0",
  });

  server.registerTool(
    "list_manuals",
    {
      description:
        "List D-Robotics RDK documentation manuals from the doc center portal. Use this first to pick a manual id.",
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
        "Search RDK documentation by keyword. Prefer this before guessing. Optional manual id/alias such as x5, s100, tros, studio, xburn.",
      inputSchema: {
        query: z.string().describe("Chinese or English search keywords"),
        manual: z
          .string()
          .optional()
          .describe("Manual id or alias, e.g. rdk-x, x5, tros, studio"),
        limit: z.number().int().min(1).max(20).optional().describe("Max hits, default 8"),
      },
    },
    async ({ query, manual, limit }) => {
      try {
        return ok(await searchDocs({ query, manual, limit }, fetchText));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_page",
    {
      description:
        "Fetch one documentation page from developer.d-robotics.cc and return readable Markdown. Use after search_docs.",
      inputSchema: {
        url: z
          .string()
          .describe("Absolute doc URL or site path such as /rdk_x_doc/RDK"),
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
        "List pages in one RDK manual. Useful when search is too broad or a manual has no search index.",
      inputSchema: {
        manual: z.string().describe("Manual id or alias"),
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
