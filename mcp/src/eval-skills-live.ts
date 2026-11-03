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
  let catalogRevision = "(unavailable)";
  let fetchedAt = "(unavailable)";
  const parseOk = (result: CallResult): any => {
    if (result.isError) throw new Error(`tool returned isError: ${textOf(result)}`);
    const data = JSON.parse(textOf(result));
    if (typeof data?.catalog_revision === "string") catalogRevision = data.catalog_revision;
    if (typeof data?.fetched_at === "string") fetchedAt = data.fetched_at;
    return data;
  };

  try {
    await client.connect(transport);

    // --- tool discovery -----------------------------------------------------
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    const expected = ["list_manuals", "search_docs", "get_page", "list_toc", "search_skills", "get_skill"];
    const missing = expected.filter((name) => !names.includes(name));
    record("tools-list", missing.length === 0, `advertised ${names.length} tools: ${names.join(", ")}`);

    // Structured constraints are authoritative even when query prose mentions exclusions.
    for (const args of [
      {query:"X5 不是X3 相机配置",task:"camera",platform:"x5",exclude_platforms:["x3"]},
      {query:"GPIO 电平转换",task:"gpio",platform:"s100"},
      {query:"现成模型 必要时转换",task:"ready_model",platform:"x5"},
      {query:"QAT 不要简化成PTQ",task:"model_conversion",workflow:"qat",platform:"s100"},
    ]) {
      try {
        const result=parseOk(await client.callTool({name:"search_skills",arguments:args}) as CallResult);
        record(`structured-${args.task}`,result.matches.length>0 && result.matches.every((m:any)=>m.classification?.tasks.includes(args.task)) && (args.workflow!=="qat" || result.matches.every((m:any)=>m.classification?.workflows.includes("qat"))),JSON.stringify(result.matches.map((m:any)=>m.name)));
      } catch (error) {
        record(`structured-${args.task}`, false, error instanceof Error ? error.message : String(error));
      }
    }

    const guard = async (id: string, body: () => Promise<{ pass: boolean; reason: string }>) => {
      try {
        const outcome = await body();
        record(id, outcome.pass, outcome.reason);
      } catch (error) {
        record(id, false, error instanceof Error ? error.message : String(error));
      }
    };
    // --- flat search (A2) ---------------------------------------------------
    await guard("search-flat-exact", async () => {
      const gpio = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "rdk-gpio-40pin" } })) as CallResult,
      );
      return {
        pass: gpio.matches?.[0]?.name === "rdk-gpio-40pin" && gpio.matches[0].install_type === "flat",
        reason: `first match ${gpio.matches?.[0]?.name} (${gpio.matches?.[0]?.install_type}), revision ${gpio.catalog_revision}`,
      };
    });

    await guard("search-gpio-task", async () => {
      const gpioTask = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "X5 40PIN GPIO" } })) as CallResult,
      );
      const gpioNames = (gpioTask.matches ?? []).map((match: { name: string }) => match.name);
      return {
        pass: gpioTask.matches?.[0]?.name === "rdk-gpio-40pin" && !gpioNames.includes("x5-accuracy-diagnostics"),
        reason: `first ${gpioTask.matches?.[0]?.name}; model-only diagnostics excluded: ${!gpioNames.includes("x5-accuracy-diagnostics")}`,
      };
    });

    // --- PTQ / ambiguous quantization (A3) ----------------------------------
    await guard("search-ptq-explicit", async () => {
      const ptq = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ 量化部署" } })) as CallResult,
      );
      return {
        pass: ptq.matches?.[0]?.name === "x5-ptq-deploy" && ptq.matches[0].install_type === "workspace",
        reason: `first ${ptq.matches?.[0]?.name} (${ptq.matches?.[0]?.install_type})`,
      };
    });

    await guard("search-quant-ambiguous", async () => {
      const ambiguous = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "X5 模型量化" } })) as CallResult,
      );
      const ambiguousNames = (ambiguous.matches ?? []).map((match: { name: string }) => match.name);
      const noDecidedSubstep = ambiguousNames.every((name: string) => !/(^|[-_])(ptq|qat)([-_]|$)/.test(name));
      return {
        pass:
          typeof ambiguous.guidance === "string" &&
          ambiguous.guidance.includes("PTQ") &&
          ambiguous.guidance.includes("QAT") &&
          noDecidedSubstep &&
          ambiguousNames[0] === "x5-router",
        reason: `guidance asks PTQ/QAT; entry first: ${ambiguousNames[0]}; matches: ${ambiguousNames.join(", ") || "(none)"}`,
      };
    });

    // --- natural-language quality (retest 2026-09-21) -----------------------
    await guard("search-ready-model-zh", async () => {
      const ready = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "现成的量化好的模型直接用" } })) as CallResult,
      );
      return {
        pass: ready.matches?.[0]?.name === "rdk-model-zoo" && ready.guidance_kind !== "ambiguous_quant",
        reason: `first ${ready.matches?.[0]?.name}, guidance_kind ${ready.guidance_kind}`,
      };
    });

    await guard("search-x5-excludes-s-pack", async () => {
      const ptqBoard = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "X5 上把模型量化后部署" } })) as CallResult,
      );
      const ptqBoardPacks = new Set((ptqBoard.matches ?? []).map((match: { pack: string }) => match.pack));
      return {
        pass: ptqBoard.guidance_kind === "ambiguous_quant" && !ptqBoardPacks.has("OE Tool Chain (S)"),
        reason: `guidance_kind ${ptqBoard.guidance_kind}; packs: ${[...ptqBoardPacks].join(", ") || "(none)"}`,
      };
    });

    await guard("search-undecided-en", async () => {
      const undecidedEn = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "quantization" } })) as CallResult,
      );
      return {
        pass: undecidedEn.guidance_kind === "ambiguous_quant",
        reason: `guidance_kind ${undecidedEn.guidance_kind} with ${undecidedEn.matches?.length ?? 0} matches (clarification independent of candidates)`,
      };
    });

    await guard("search-platform-conflict", async () => {
      const conflict = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ", platform: "s100" } })) as CallResult,
      );
      return {
        pass: conflict.guidance_kind === "platform_conflict" && (conflict.matches ?? []).length === 0,
        reason: `guidance_kind ${conflict.guidance_kind}; guidance mentions boards: ${/X5/.test(String(conflict.guidance)) && /S100/.test(String(conflict.guidance))}`,
      };
    });

    // --- flat detail (A4) ----------------------------------------------------
    await guard("get-flat-detail", async () => {
      const flat = parseOk(
        (await client.callTool({ name: "get_skill", arguments: { name: "rdk-gpio-40pin" } })) as CallResult,
      );
      const flatOk =
        flat.installation?.type === "flat" &&
        Array.isArray(flat.installation?.args) &&
        flat.installation.args.join(" ") === "skills add d-robotics/rdk-skills --skill rdk-gpio-40pin" &&
        typeof flat.source_url === "string" &&
        flat.source_url === `https://github.com/D-Robotics/rdk-skills/blob/${flat.catalog_revision}/skills/rdk-gpio-40pin/SKILL.md`;
      return {
        pass: flatOk,
        reason: `${flat.installation?.display_command}; source_url pinned to revision ${flat.catalog_revision}`,
      };
    });

    // --- workspace detail (A5) ----------------------------------------------
    await guard("get-workspace-detail", async () => {
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
      return {
        pass: workspaceOk,
        reason: `pack ${workspace.installation?.pack?.name} ref ${workspace.installation?.pack?.ref}, ${workspace.installation?.pack?.verify_paths?.length} verify_paths, installer handoff present`,
      };
    });

    // --- display name keeps canonical identity (retest 2026-09-21) ----------
    let sSeries: { name?: string; display_name?: string } = {};
    try {
      sSeries = parseOk(
        (await client.callTool({
          name: "get_skill",
          arguments: { name: "s-plugin-set-fake-quantize" },
        })) as CallResult,
      );
      record(
        "get-display-name",
        sSeries.name === "s-plugin-set-fake-quantize" && sSeries.display_name === "s-plugin-set-fake-quantize",
        `name ${sSeries.name} → display_name ${sSeries.display_name}`,
      );
    } catch (error) {
      record("get-display-name", false, error instanceof Error ? error.message : String(error));
    }

    // --- errors (A6) ---------------------------------------------------------
    try {
      const unknown = parseError(
        (await client.callTool({ name: "get_skill", arguments: { name: "zzz-nonexistent-skill" } })) as CallResult,
      );
      record("get-unknown-error", unknown.code === "unknown_skill", `code=${unknown.code}`);
    } catch (error) {
      record("get-unknown-error", false, error instanceof Error ? error.message : String(error));
    }

    try {
      const unrelated = parseOk(
        (await client.callTool({ name: "search_skills", arguments: { query: "量子纠缠曲奇怎么做" } })) as CallResult,
      );
      record("search-no-match", Array.isArray(unrelated.matches) && unrelated.matches.length === 0, "empty matches with guidance");
    } catch (error) {
      record("search-no-match", false, error instanceof Error ? error.message : String(error));
    }

    console.log(
      `\ncatalog revision ${catalogRevision}, fetched_at ${fetchedAt}, ${Date.now() - startedAt}ms elapsed`,
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
