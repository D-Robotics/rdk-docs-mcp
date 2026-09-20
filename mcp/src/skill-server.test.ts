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
