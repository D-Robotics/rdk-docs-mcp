import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Live smoke test for the skill-discovery tools (issue #4 A10). Runs the
 * built server over a real stdio MCP connection against the real
 * D-Robotics/rdk-skills hub. The child process gets an isolated HOME and
 * RDK_DOCS_CACHE_DIR so nothing touches the user's real configuration, and
 * nothing here executes install commands — the install outputs are only
 * inspected. Run explicitly via `npm run eval:skills`.
 */

type Check = { id: string; pass: boolean; reason: string };

type CallResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

function textOf(result: CallResult): string {
  const text = result.content?.find((part) => part.type === "text")?.text;
  if (text === undefined) throw new Error("tool result has no text content");
  return text;
}

function parseOk(result: CallResult): any {
  if (result.isError) throw new Error(`tool returned isError: ${textOf(result)}`);
  return JSON.parse(textOf(result));
}

function parseError(result: CallResult): { code: string; message: string } {
  if (!result.isError) throw new Error(`expected an error result, got: ${textOf(result).slice(0, 200)}`);
  const parsed = JSON.parse(textOf(result)) as { error: { code: string; message: string } };
  return parsed.error;
}

async function main() {
  const startedAt = Date.now();
  const distRoot = dirname(fileURLToPath(import.meta.url));
  const serverPath = join(distRoot, "index.js");

  const isolatedHome = mkdtempSync(join(tmpdir(), "rdk-skills-eval-home-"));
  const isolatedCache = mkdtempSync(join(tmpdir(), "rdk-skills-eval-cache-"));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: isolatedHome, // keeps the startup skill refresh away from real user dirs
      RDK_DOCS_CACHE_DIR: isolatedCache, // catalog snapshot cache stays in the sandbox
    },
  });
  const client = new Client({ name: "rdk-skills-eval", version: "1.0.0" }, { capabilities: {} });

  const checks: Check[] = [];
  const record = (id: string, pass: boolean, reason: string) => {
    checks.push({ id, pass, reason });
    console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${reason}`);
  };

  try {
    await client.connect(transport);

    // --- tool discovery -----------------------------------------------------
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    const expected = ["list_manuals", "search_docs", "get_page", "list_toc", "search_skills", "get_skill"];
    const missing = expected.filter((name) => !names.includes(name));
    record("tools-list", missing.length === 0, `advertised ${names.length} tools: ${names.join(", ")}`);

    // --- flat search (A2) ---------------------------------------------------
    const gpio = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "rdk-gpio-40pin" } })) as CallResult,
    );
    record(
      "search-flat-exact",
      gpio.matches?.[0]?.name === "rdk-gpio-40pin" && gpio.matches[0].install_type === "flat",
      `first match ${gpio.matches?.[0]?.name} (${gpio.matches?.[0]?.install_type}), revision ${gpio.catalog_revision}`,
    );

    const gpioTask = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 40PIN GPIO" } })) as CallResult,
    );
    const gpioNames = (gpioTask.matches ?? []).map((match: { name: string }) => match.name);
    record(
      "search-gpio-task",
      gpioTask.matches?.[0]?.name === "rdk-gpio-40pin" && !gpioNames.includes("x5-accuracy-diagnostics"),
      `first ${gpioTask.matches?.[0]?.name}; model-only diagnostics excluded: ${!gpioNames.includes("x5-accuracy-diagnostics")}`,
    );

    // --- PTQ / ambiguous quantization (A3) ----------------------------------
    const ptq = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ 量化部署" } })) as CallResult,
    );
    record(
      "search-ptq-explicit",
      ptq.matches?.[0]?.name === "x5-ptq-deploy" && ptq.matches[0].install_type === "workspace",
      `first ${ptq.matches?.[0]?.name} (${ptq.matches?.[0]?.install_type})`,
    );

    const ambiguous = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 模型量化" } })) as CallResult,
    );
    const ambiguousNames = (ambiguous.matches ?? []).map((match: { name: string }) => match.name);
    const noDecidedSubstep = ambiguousNames.every((name: string) => !/(^|[-_])(ptq|qat)([-_]|$)/.test(name));
    record(
      "search-quant-ambiguous",
      typeof ambiguous.guidance === "string" &&
        ambiguous.guidance.includes("PTQ") &&
        ambiguous.guidance.includes("QAT") &&
        noDecidedSubstep &&
        ambiguousNames[0] === "x5-router",
      `guidance asks PTQ/QAT; entry first: ${ambiguousNames[0]}; matches: ${ambiguousNames.join(", ") || "(none)"}`,
    );

    // --- natural-language quality (retest 2026-09-21) -----------------------
    const ready = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "现成的量化好的模型直接用" } })) as CallResult,
    );
    record(
      "search-ready-model-zh",
      ready.matches?.[0]?.name === "rdk-model-zoo" && ready.guidance_kind !== "ambiguous_quant",
      `first ${ready.matches?.[0]?.name}, guidance_kind ${ready.guidance_kind}`,
    );

    const ptqBoard = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 上把模型量化后部署" } })) as CallResult,
    );
    const ptqBoardPacks = new Set((ptqBoard.matches ?? []).map((match: { pack: string }) => match.pack));
    record(
      "search-x5-excludes-s-pack",
      ptqBoard.guidance_kind === "ambiguous_quant" && !ptqBoardPacks.has("OE Tool Chain (S)"),
      `guidance_kind ${ptqBoard.guidance_kind}; packs: ${[...ptqBoardPacks].join(", ") || "(none)"}`,
    );

    const undecidedEn = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "quantization" } })) as CallResult,
    );
    record(
      "search-undecided-en",
      undecidedEn.guidance_kind === "ambiguous_quant",
      `guidance_kind ${undecidedEn.guidance_kind} with ${undecidedEn.matches?.length ?? 0} matches (clarification independent of candidates)`,
    );

    const conflict = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ", platform: "s100" } })) as CallResult,
    );
    record(
      "search-platform-conflict",
      conflict.guidance_kind === "platform_conflict" && (conflict.matches ?? []).length === 0,
      `guidance_kind ${conflict.guidance_kind}; guidance mentions boards: ${/X5/.test(String(conflict.guidance)) && /S100/.test(String(conflict.guidance))}`,
    );

    // --- flat detail (A4) ----------------------------------------------------
    const flat = parseOk(
      (await client.callTool({ name: "get_skill", arguments: { name: "rdk-gpio-40pin" } })) as CallResult,
    );
    const flatOk =
      flat.installation?.type === "flat" &&
      Array.isArray(flat.installation?.args) &&
      flat.installation.args.join(" ") === "skills add d-robotics/rdk-skills --skill rdk-gpio-40pin" &&
      typeof flat.source_url === "string" &&
      flat.source_url === `https://github.com/D-Robotics/rdk-skills/blob/${flat.catalog_revision}/skills/rdk-gpio-40pin/SKILL.md`;
    record(
      "get-flat-detail",
      flatOk,
      `${flat.installation?.display_command}; source_url pinned to revision ${flat.catalog_revision}`,
    );

    // --- workspace detail (A5) ----------------------------------------------
    const workspace = parseOk(
      (await client.callTool({ name: "get_skill", arguments: { name: "x5-ptq-deploy" } })) as CallResult,
    );
    const workspaceOk =
      workspace.installation?.type === "workspace" &&
      workspace.installation?.handoff_skill === "rdk-pack-installer" &&
      Array.isArray(workspace.installation?.installer?.args) &&
      workspace.installation.installer.args.includes("rdk-pack-installer") &&
      typeof workspace.installation?.pack?.ref === "string" &&
      Array.isArray(workspace.installation?.pack?.verify_paths) &&
      workspace.installation.pack.verify_paths.length > 0 &&
      workspace.installation.requires_project_root === true &&
      !JSON.stringify(workspace.installation).includes('"--skill","x5-ptq-deploy"');
    record(
      "get-workspace-detail",
      workspaceOk,
      `pack ${workspace.installation?.pack?.name} ref ${workspace.installation?.pack?.ref}, ${workspace.installation?.pack?.verify_paths?.length} verify_paths, installer handoff present`,
    );

    // --- display name keeps canonical identity (retest 2026-09-21) ----------
    const sSeries = parseOk(
      (await client.callTool({
        name: "get_skill",
        arguments: { name: "__SKILL_j6-plugin-__set-fake-quantize" },
      })) as CallResult,
    );
    record(
      "get-display-name",
      sSeries.name === "__SKILL_j6-plugin-__set-fake-quantize" && sSeries.display_name === "j6-plugin-set-fake-quantize",
      `name ${sSeries.name} → display_name ${sSeries.display_name}`,
    );

    // --- errors (A6) ---------------------------------------------------------
    const unknown = parseError(
      (await client.callTool({ name: "get_skill", arguments: { name: "zzz-nonexistent-skill" } })) as CallResult,
    );
    record("get-unknown-error", unknown.code === "unknown_skill", `code=${unknown.code}`);

    const unrelated = parseOk(
      (await client.callTool({ name: "search_skills", arguments: { query: "量子纠缠曲奇怎么做" } })) as CallResult,
    );
    record("search-no-match", Array.isArray(unrelated.matches) && unrelated.matches.length === 0, "empty matches with guidance");

    console.log(
      `\ncatalog revision ${gpio.catalog_revision}, fetched_at ${gpio.fetched_at}, ${Date.now() - startedAt}ms elapsed`,
    );
  } finally {
    await client.close();
    rmSync(isolatedHome, { recursive: true, force: true });
    rmSync(isolatedCache, { recursive: true, force: true });
  }

  const failed = checks.filter((check) => !check.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} live skill-catalog checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
