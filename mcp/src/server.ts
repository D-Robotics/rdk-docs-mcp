import { TASKS, PLATFORMS, ROLES } from "./skill-structured.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listManuals } from "./catalog.js";
import { fetchText } from "./http.js";
import { SkillError } from "./skill-catalog.js";
import { getSkillDetail, searchSkills, type SkillServiceDeps } from "./skill-service.js";
import { getPage, listToc, searchDocs } from "./service.js";

import { DISPLAY_NAME, PACKAGE_VERSION, SERVER_ID } from "./version.js";
import { getStatus } from "./status.js";
export { PACKAGE_VERSION } from "./version.js";

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
    name: SERVER_ID,
    title: DISPLAY_NAME,
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    "get_status",
    {
      description: "Read RDK Assistant MCP version and supported capabilities. Optionally check Skill catalog revision and metadata coverage. Does not install or refresh local Skills; a catalog check may update its read cache.",
      inputSchema: z.object({ check_catalog: z.boolean().optional().describe("Fetch/check catalog health, default false (offline capabilities only)") }).strict(),
    },
    async (input) => ok(await getStatus(input, options.skillDeps)),
  );

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
        offset: z.number().int().min(0).optional().describe("Continuation offset from next_offset; requires expected_content_hash when nonzero"),
        expected_content_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      },
    },
    async ({ url, maxChars, offset, expected_content_hash }) => {
      try {
        return ok(await getPage({ url, maxChars, offset, expected_content_hash }, fetchText));
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
        "Find verified catalog candidates, not installed skills. The calling model MUST interpret user intent, exclusions, conditionals and split compound tasks first. Prefer task plus explicit platform/exclude_platforms/workflow. Query is short ranking text, NOT an instruction parser. ready_model means finding existing artifacts, model_conversion means creating them, model_maintenance means maintaining the catalog/samples. For model_conversion ask PTQ/QAT when undecided. Use model_compile for existing artifact compilation without inventing a quantization workflow; network for board networking. Inspect metadata_health and category_only guidance. For comparisons search each board separately. Query-only calls are legacy candidate retrieval; inspect get_skill before recommending 1-2. Hardware facts must use search_docs/get_page. Unknown metadata is not compatibility.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Short ranking keywords or canonical name. With task, prose never sets board/workflow constraints. Non-empty, max 500 chars",
          ),
        role: z.enum(ROLES).optional().describe("Workflow entry, full workflow, or individual step; requires task"),
        task: z.enum(TASKS).optional().describe("Caller-selected task. Split camera+GPIO etc into separate calls."),
        exclude_platforms: z.array(z.enum(PLATFORMS)).max(6).optional().describe("Explicit exclusions; requires task. Do not include boards merely mentioned for comparison."),
        workflow: z.enum(["ptq", "qat", "undecided"]).nullable().optional().describe("Only for model_conversion. Infer from explicit user intent, not the word training alone."),
        pack: z.string().optional().describe("Exact catalog pack filter"),
        platform: z
          .string()
          .optional()
          .describe(
            "Explicit target: x3, x5, s100, s100p, s600, ultra. With task this overrides prose board mentions; missing platform metadata stays unknown.",
          ),
        install_type: z
          .enum(["flat", "workspace"])
          .optional()
          .describe("flat = single skill install via npx skills add; workspace = whole pack via rdk-pack-installer handoff"),
        limit: z.number().int().min(1).max(20).optional().describe("Max matches, default 5"),
      }).strict(),
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
        "Get one skill's catalog detail and structured install guidance by its exact catalog name (from search_skills; display_name is for humans only — always fetch and install by the exact name field). flat returns an npx skills add command; workspace returns the full pack handoff (pack repo/ref/verify_paths plus the rdk-pack-installer acquisition command). Use include_content=true to inspect the revision-bound SKILL.md before evaluating prerequisites. Catalog summary alone is not content verification. Read-only: nothing is installed and no script runs; only proceed with installation when the user explicitly asks.",
      inputSchema: z.object({
        include_content: z.boolean().optional().describe("Retrieve bounded SKILL.md source pinned to catalog_revision; default false"),
        max_chars: z.number().int().min(1000).max(40000).optional(),
        offset: z.number().int().min(0).optional(),
        expected_content_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        name: z.string().describe("Exact skill name from the catalog, e.g. 'rdk-gpio-40pin' or '__SKILL_j6-plugin-__set-fake-quantize' (no fuzzy matching, no display names)"),
      }).strict(),
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
