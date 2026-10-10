import { TASKS, PLATFORMS } from "./skill-structured.js";
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
        "Search RDK manuals with BM25 over heading chunks, including FAQ question/answer sections. Pass a short focused query: the error text, a command or API, or a few content words — not the user's whole paragraph. Pass board (x3|x5|s100|s600) whenever you know the board, even if the user left it out. When the user spoke colloquially, or the query is a pasted log or traceback, also pass alt_queries: up to 3 short reformulations in the wording of the manuals. Drop timestamps, host paths, and hex dumps; name the task the way a chapter title would, without adding facts the user did not state. Leave alt_queries empty when query is already a short manual phrase, a command, or an API name. The server searches each string and merges pages; it does not rewrite the query itself. Each hit has title, url, manual, snippet, score, coverage, confidence, and board when known. Read the top snippets and decide yourself whether they answer the question. confidence is advisory. noGoodMatch=false is not proof of relevance. noGoodMatch=true only when the query contains a package, command, API, or error code that appears in none of the searched manuals and not in the top hit: do not invent that identifier. If the snippets do not answer, reformulate and search again. Try 2 reformulations (different keywords, the error string, or the FAQ wording) before concluding nothing is documented. groups clusters hits by board. ambiguousBoard=true means the query named no board: do not treat hits[0] as the user's board, and do not assume one product series. A named board hard-filters the other family, so an X3/X5 question will not return S-series OE pages. source=forum or manual=forum for community posts; source=all only when the user asked for forum input. Keep models separate. Do not invent commands or pinouts.",
      inputSchema: {
        query: z.string().describe("Short keywords, error string, or identifier. Not a full paragraph. Keep identifiers whole, e.g. hobot_dnn, hrt_model_exec, AttributeError"),
        manual: z
          .string()
          .optional()
          .describe("Manual id or alias, e.g. rdk-x, x5, tros, studio"),
        source: z
          .enum(["docs", "forum", "all"])
          .optional()
          .describe("docs = manuals only; forum = community only; all = docs first, forum as supplement"),
        board: z
          .enum(["x3", "x5", "s100", "s600"])
          .optional()
          .describe("Pass when the board is known (x3|x5|s100|s600), even if the query omitted it. Omit when comparing boards or the board is unknown"),
        limit: z.number().int().min(1).max(20).optional().describe("Max hits, default 8"),
        alt_queries: z
          .array(z.string())
          .max(3)
          .optional()
          .describe(
            "Up to 3 short reformulations in documentation wording, each at most 300 characters. A longer one is dropped and listed in warnings; the search still runs. Pass when the user was colloquial or pasted a log. Omit when query is already a manual phrase.",
          ),
      },
    },
    async ({ query, manual, source, board, limit, alt_queries }) => {
        try {
          return ok(await searchDocs({ query, manual, source, board, limit, altQueries: alt_queries }, fetchText));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_page",
    {
      description:
        "Read one official page or public forum topic as Markdown. By default returns the most relevant sections, about 6000 characters, each with its heading, plus the page URL. Pass query so those sections match the question; omit query to get the leading sections. Pass full=true for the whole page (maxChars then applies, default 16000, at most 40000). Pass section, or a URL hash, to extract one heading. imageOnly=true means the pin map is only in the images listed in contentNotes — do not invent pin numbers. truncated=true means the page has more text: pass full=true or a narrower query.",
      inputSchema: {
        url: z
          .string()
          .describe(
            "URL returned by search_docs: official documentation on developer.d-robotics.cc or a public read-only forum topic on forum.d-robotics.cc",
          ),
        maxChars: z
          .number()
          .int()
          .min(1000)
          .max(40000)
          .optional()
          .describe("With full=true, maximum characters of the page (default 16000). The default section mode stays near 6000 even if this is higher."),
        section: z.string().optional().describe("Heading to extract, e.g. 40PIN 管脚定义"),
        query: z.string().optional().describe("Prefer sections that answer this. Omit to return the leading sections."),
        full: z.boolean().optional().describe("Return the whole page instead of the relevant sections."),
      },
    },
    async ({ url, maxChars, section, query, full }) => {
      try {
        return ok(await getPage({ url, maxChars, section, query, full }, fetchText));
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
        "Find verified catalog candidates, not installed skills. The calling model MUST interpret user intent, exclusions, conditionals and split compound tasks first. Prefer task plus explicit platform/exclude_platforms/workflow. Query is short ranking text, NOT an instruction parser. ready_model means finding existing artifacts, model_conversion means creating them, model_maintenance means maintaining the catalog/samples. For model_conversion ask PTQ/QAT when undecided. For comparisons search each board separately. Query-only calls are legacy candidate retrieval; inspect get_skill before recommending 1-2. Hardware facts must use search_docs/get_page. Unknown metadata is not compatibility.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Short ranking keywords or canonical name. With task, prose never sets board/workflow constraints. Non-empty, max 500 chars",
          ),
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
