import {readFileSync} from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SkillError, type SkillCatalogSnapshot, type SkillRecord } from "./skill-catalog.js";
import { createServer } from "./server.js";

/**
 * Real MCP protocol tests over the SDK's in-memory transport: tool discovery,
 * both new tools, error payloads, and isolation of the four original tools
 * from catalog failures (issue #4 A1).
 */

const SHA = "08d0a466413f11bbc045ba5e51f626bdb0346373";

const SKILLS: SkillRecord[] = [
  {
    name: "rdk-gpio-40pin",
    description: "Use the 40PIN interface on D-Robotics RDK devices with the preinstalled Hobot.GPIO Python library, covering GPIO, I2C, SPI, UART, and PWM wiring and first-run samples.",
    pack: "RDK Device Skills",
    repo: "D-Robotics/rdk-device-skills",
    catalog_path: "skills/rdk-gpio-40pin",
    install_type: "flat",
  },
  {
    name: "rdk-pack-installer",
    description: "Install or upgrade a D-Robotics workspace-integrated Skill Pack in a local development project.",
    pack: "D-Robotics Skills",
    repo: "D-Robotics/rdk-skills",
    catalog_path: "skills/rdk-pack-installer",
    install_type: "flat",
  },
  {
    name: "x5-router",
    description: "路由 X5 环境、OE Mapper PTQ、Plugin QAT、Runtime、板端 Python 和诊断请求。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-router",
    install_type: "workspace",
  },
  {
    name: "x5-ptq-deploy",
    description:
      "编排 ONNX/Caffe 到 X5 bayes-e .bin 的 OE Mapper PTQ 全流程；当用户要求 checker、校准、YAML、makertbin、模型信息和 Runtime 验证形成闭环时使用。通过原子 Skills 执行，不接受 Plugin QAT .hbm/.hbir、HAT 或 S 系列流程。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-ptq-deploy",
    install_type: "workspace",
  },
  {
    name: "x5-qat-deploy",
    description:
      "编排 X5 horizon_plugin_pytorch calibration、QAT、定点转换与 Plugin 编译；当用户有可训练 PyTorch 模型、数据和浮点基线，希望得到 March.BAYES_E 的 .hbm/.hbir 及指标闭环时使用。明确排除 HAT，且不把 QAT 自动交给 hb_mapper makertbin。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-qat-deploy",
    install_type: "workspace",
  },
  {
    name: "rdk-model-zoo",
    description:
      "Use when asking about ready-made RDK Model Zoo models, matching branches, downloads, sample execution, or published benchmarks. 触发词：现成模型、跑示例、模型目录、帧率查询。Do not use as the primary skill for PR review, repository development, custom quantization, or fresh performance measurement.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo",
    install_type: "flat",
  },
  {
    name: "__SKILL_j6-plugin-__set-fake-quantize",
    description:
      "在适配 horizon_plugin_pytorch 的量化流程中，为模型设置 fake quantize 状态（QAT/CALIBRATION/VALIDATION）。只添加/调用 set_fake_quantize，不做其他修改。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-set-fake-quantize",
    install_type: "workspace",
  },
];

const SNAPSHOT: SkillCatalogSnapshot = {
  schema: 1,
  revision: SHA,
  fetched_at: "2026-09-20T08:00:00.000Z",
  skills: SKILLS,
  packs: [
    {
      name: "OE Tool Chain (X5)",
      repo: "D-Robotics/oe-skills-x5",
      ref: "v1.0.0",
      catalog_dir: "oe-skills-x5",
      install_script: "setup.sh",
      workspace_dir: ".drobotics",
      verify_paths: [".drobotics/VERSION"],
    },
    {
      name: "OE Tool Chain (S)",
      repo: "D-Robotics/oe-skills-s",
      ref: "v1.0.0",
      catalog_dir: "oe-skills-s",
      install_script: "setup.sh",
      workspace_dir: ".horizon",
      verify_paths: [".horizon/VERSION"],
    },
  ],
};

async function withClient(
  options: Parameters<typeof createServer>[0],
): Promise<Client> {
  const server = createServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skill-server-test", version: "1.0.0" }, { capabilities: {} });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

type CallToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: unknown };

function parseText(result: CallToolResult): any {
  expect(result.isError).toBeFalsy();
  const text = result.content?.find((part) => part.type === "text")?.text;
  expect(text).toBeTruthy();
  return JSON.parse(text as string);
}

function parseError(result: CallToolResult): { code: string; message: string } {
  expect(result.isError).toBe(true);
  const text = result.content?.find((part) => part.type === "text")?.text;
  expect(text).toBeTruthy();
  const parsed = JSON.parse(text as string) as { error: { code: string; message: string } };
  return parsed.error;
}

describe("MCP server: skill tools over the protocol", () => {
  it("advertises six tools: the original four plus search_skills and get_skill", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "get_page",
      "get_skill",
      "list_manuals",
      "list_toc",
      "search_docs",
      "search_skills",
    ]);
    await client.close();
  });

  it("serves search_skills results through the protocol", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const parsed = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 40PIN GPIO" } })) as CallToolResult,
    );
    expect(parsed.matches[0].name).toBe("rdk-gpio-40pin");
    expect(parsed.catalog_revision).toBe(SHA);
    expect(parsed.matches[0].source_url).toContain(`blob/${SHA}/skills/rdk-gpio-40pin/SKILL.md`);
    expect(typeof parsed.guidance).toBe("string");
    await client.close();
  });

  it("serves flat and workspace get_skill details through the protocol", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const flat = parseText(
      (await client.callTool({ name: "get_skill", arguments: { name: "rdk-gpio-40pin" } })) as CallToolResult,
    );
    expect(flat.installation.type).toBe("flat");
    expect(flat.installation.args).toEqual(["skills", "add", "d-robotics/rdk-skills", "--skill", "rdk-gpio-40pin"]);

    const workspace = parseText(
      (await client.callTool({ name: "get_skill", arguments: { name: "x5-router" } })) as CallToolResult,
    );
    expect(workspace.installation.type).toBe("workspace");
    expect(workspace.installation.pack.workspace_dir).toBe(".drobotics");
    expect(workspace.installation.installer.args).toContain("rdk-pack-installer");
    await client.close();
  });

  it("returns stable error codes through the protocol", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const unknown = parseError(
      (await client.callTool({ name: "get_skill", arguments: { name: "does-not-exist" } })) as CallToolResult,
    );
    expect(unknown.code).toBe("unknown_skill");
    expect(unknown.message).toContain("does-not-exist");

    const blank = parseError(
      (await client.callTool({ name: "search_skills", arguments: { query: "   " } })) as CallToolResult,
    );
    expect(blank.code).toBe("invalid_input");

    const tooLong = parseError(
      (await client.callTool({ name: "search_skills", arguments: { query: "x".repeat(501) } })) as CallToolResult,
    );
    expect(tooLong.code).toBe("invalid_input");
    await client.close();
  });

  it("excludes the mutually exclusive quantization path over the protocol (retest 2026-09-21)", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const ptq = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ 量化部署" } })) as CallToolResult,
    );
    const ptqNames = ptq.matches.map((match: { name: string }) => match.name);
    expect(ptqNames).toContain("x5-ptq-deploy");
    expect(ptqNames).not.toContain("x5-qat-deploy");

    const qat = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 QAT 量化部署" } })) as CallToolResult,
    );
    const qatNames = qat.matches.map((match: { name: string }) => match.name);
    expect(qatNames).toContain("x5-qat-deploy");
    expect(qatNames).not.toContain("x5-ptq-deploy");
    await client.close();
  });

  it("reports zero-token queries as invalid_input over the protocol (retest 2026-09-21)", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const parsed = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "!!!" } })) as CallToolResult,
    );
    expect(parsed.matches).toEqual([]);
    expect(parsed.guidance_kind).toBe("invalid_input");
    expect(parsed.guidance).toMatch(/no usable search terms/i);
    await client.close();
  });

  it("routes a Chinese ready-model ask to the Model Zoo entry over the protocol (retest 2026-09-21)", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const parsed = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "现成的量化好的模型直接用" } })) as CallToolResult,
    );
    expect(parsed.matches[0].name).toBe("rdk-model-zoo");
    expect(parsed.matches[0].display_name).toBe("rdk-model-zoo");
    expect(parsed.guidance_kind).not.toBe("ambiguous_quant");
    await client.close();
  });

  it("keeps undecided quantization clarification independent of candidates over the protocol", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    for (const query of ["我想量化模型", "quantization"]) {
      const parsed = parseText(
        (await client.callTool({ name: "search_skills", arguments: { query } })) as CallToolResult,
      );
      expect(parsed.guidance_kind).toBe("ambiguous_quant");
      expect(parsed.guidance).toContain("PTQ");
      expect(parsed.guidance).toContain("QAT");
      for (const match of parsed.matches ?? []) {
        expect(/(^|[-_])(ptq|qat)([-_]|$)/.test(String(match.name).toLowerCase())).toBe(false);
      }
    }
    await client.close();
  });

  it("excludes the S-series pack for X5 queries and reports platform conflicts over the protocol", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const byQuery = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 上把模型量化后部署" } })) as CallToolResult,
    );
    expect(byQuery.matches.map((match: { name: string }) => match.name)).not.toContain("__SKILL_j6-plugin-__set-fake-quantize");
    expect(byQuery.matches[0].name).toBe("x5-router");

    const byPlatform = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "量化模型 PTQ", platform: "x5" } })) as CallToolResult,
    );
    expect(byPlatform.matches.map((match: { name: string }) => match.name)).not.toContain("__SKILL_j6-plugin-__set-fake-quantize");
    expect(byPlatform.matches[0].name).toBe("x5-ptq-deploy");

    const conflict = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "X5 PTQ", platform: "s100" } })) as CallToolResult,
    );
    expect(conflict.matches).toEqual([]);
    expect(conflict.guidance_kind).toBe("platform_conflict");
    expect(conflict.guidance).toContain("X5");
    expect(conflict.guidance).toContain("S100");
    await client.close();
  });

  it("serves display_name while get_skill stays keyed by the exact canonical name", async () => {
    const client = await withClient({ skillDeps: { loadCatalog: async () => ({ snapshot: SNAPSHOT, warnings: [], from_cache: false }) } });
    const search = parseText(
      (await client.callTool({ name: "search_skills", arguments: { query: "__SKILL_j6-plugin-__set-fake-quantize" } })) as CallToolResult,
    );
    expect(search.matches[0].name).toBe("__SKILL_j6-plugin-__set-fake-quantize");
    expect(search.matches[0].display_name).toBe("j6-plugin-set-fake-quantize");

    const detail = parseText(
      (await client.callTool({ name: "get_skill", arguments: { name: "__SKILL_j6-plugin-__set-fake-quantize" } })) as CallToolResult,
    );
    expect(detail.name).toBe("__SKILL_j6-plugin-__set-fake-quantize");
    expect(detail.display_name).toBe("j6-plugin-set-fake-quantize");
    expect(detail.installation.type).toBe("workspace");
    expect(detail.installation.pack.workspace_dir).toBe(".horizon");

    const missing = parseError(
      (await client.callTool({ name: "get_skill", arguments: { name: "j6-plugin-set-fake-quantize" } })) as CallToolResult,
    );
    expect(missing.code).toBe("unknown_skill");
    await client.close();
  });

  it("keeps the four original tools working while the catalog is unavailable", async () => {
    const client = await withClient({
      skillDeps: {
        loadCatalog: async () => {
          throw new SkillError("catalog_unavailable", "HTTP 403 fetching revision (GitHub rate limit; retry later)");
        },
      },
    });
    const manuals = parseText((await client.callTool({ name: "list_manuals", arguments: {} })) as CallToolResult);
    expect(Array.isArray(manuals)).toBe(true);
    expect(manuals.length).toBeGreaterThan(0);

    const error = parseError(
      (await client.callTool({ name: "search_skills", arguments: { query: "GPIO" } })) as CallToolResult,
    );
    expect(error.code).toBe("catalog_unavailable");
    expect(error.message).toContain("403");
    await client.close();
  });
});

 describe('structured MCP contract',()=>{
 it('advertises constraints and carries metadata through search and detail',async()=>{
  const skills=JSON.parse(readFileSync(new URL('./fixtures/skills-reviewed.json',import.meta.url),'utf8'));
  const client=await withClient({skillDeps:{loadCatalog:async()=>({snapshot:{...SNAPSHOT,skills},warnings:[],from_cache:false})}});
  try {
   const tools=await client.listTools();expect(tools.tools.find(t=>t.name==='search_skills')?.inputSchema.properties).toHaveProperty('task');
   const result=parseText(await client.callTool({name:'search_skills',arguments:{query:'X5 不是X3 相机',task:'camera',platform:'x5',exclude_platforms:['x3']}}));
   expect(result.matches.length).toBeGreaterThan(0);
   for(const m of result.matches){expect(m.classification.tasks).toContain('camera');const detail=parseText(await client.callTool({name:'get_skill',arguments:{name:m.name}}));expect(detail.classification).toEqual(m.classification);}
   const bad=await client.callTool({name:'search_skills',arguments:{query:'camera',task:'camera',workflow:'qat'}});expect(bad.isError).toBe(true);
  }finally{await client.close();}
 });
 });
