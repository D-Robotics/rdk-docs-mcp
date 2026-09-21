import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listManuals } from "./catalog.js";
import { fetchText } from "./http.js";
import { SkillError } from "./skill-catalog.js";
import { getSkillDetail, searchSkills, type SkillServiceDeps } from "./skill-service.js";
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

/** Skill tools report a stable {code, message} pair (issue #4 §4). */
function failSkill(error: unknown) {
  if (error instanceof SkillError) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2) },
      ],
      isError: true,
    };
  }
  return fail(error);
}

export function createServer(options: { skillDeps?: SkillServiceDeps } = {}): McpServer {
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

  server.registerTool(
    "search_skills",
    {
      description:
        "Search the D-Robotics/rdk-skills catalog for Skills matching a task (read-only). Results are catalog records from one snapshot revision: presence in the catalog does NOT mean the skill is installed locally. Recommend at most 1-2 after checking get_skill; official docs questions still go through search_docs/get_page first. Natural language works in Chinese and English: describe the task as the user would (e.g. 现成的量化好的模型 is model consumption, 量化 alone stays undecided between PTQ/QAT). A board named in the query or the platform parameter scopes results by known pack board families (unknown scope is reported as platform_scope=unknown, never as compatibility); contradictory board inputs return guidance_kind=platform_conflict with no candidates.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Task description or exact skill name, e.g. 'X5 40PIN GPIO', 'X5 PTQ 量化部署', '现成的量化好的模型直接用'. Non-empty after trimming, max 500 chars",
          ),
        pack: z.string().optional().describe("Filter by pack name, e.g. 'OE Tool Chain (X5)'"),
        platform: z
          .string()
          .optional()
          .describe(
            "Board filter, e.g. 'x5' (drops packs known to target other board families; checked against boards named in the query — contradictions return platform_conflict, not a silent guess)",
          ),
        install_type: z
          .enum(["flat", "workspace"])
          .optional()
          .describe("flat = single skill install via npx skills add; workspace = whole pack via rdk-pack-installer handoff"),
        limit: z.number().int().min(1).max(20).optional().describe("Max matches, default 5"),
      },
    },
    async (input) => {
      try {
        return ok(await searchSkills(input, options.skillDeps));
      } catch (error) {
        return failSkill(error);
      }
    },
  );

  server.registerTool(
    "get_skill",
    {
      description:
        "Get one skill's catalog detail and structured install guidance by its exact catalog name (from search_skills; display_name is for humans only — always fetch and install by the exact name field). flat returns an npx skills add command; workspace returns the full pack handoff (pack repo/ref/verify_paths plus the rdk-pack-installer acquisition command). Read-only: nothing is installed and no script runs; only proceed with installation when the user explicitly asks.",
      inputSchema: {
        name: z.string().describe("Exact skill name from the catalog, e.g. 'rdk-gpio-40pin' or '__SKILL_j6-plugin-__set-fake-quantize' (no fuzzy matching, no display names)"),
      },
    },
    async (input) => {
      try {
        return ok(await getSkillDetail(input, options.skillDeps));
      } catch (error) {
        return failSkill(error);
      }
    },
  );

  return server;
}
