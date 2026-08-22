import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installRdkDocs, MCP_SERVER, refreshInstalledSkills } from "./install.js";

const skillBody = `---
name: rdk-docs
description: test skill
---
# test
`;

function home(): string {
  return mkdtempSync(join(tmpdir(), "rdk-docs-install-"));
}

describe("installRdkDocs", () => {
  it("writes Cursor MCP + Skill when ~/.cursor exists", () => {
    const root = home();
    mkdirSync(join(root, ".cursor"));
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    const mcp = JSON.parse(readFileSync(join(root, ".cursor", "mcp.json"), "utf8"));
    expect(mcp.mcpServers["rdk-docs"]).toEqual(MCP_SERVER);
    expect(readFileSync(join(root, ".cursor", "skills", "rdk-docs", "SKILL.md"), "utf8")).toContain("rdk-docs");
    expect(result.mcp).toContain(join(root, ".cursor", "mcp.json"));
    expect(result.skills).toContain(join(root, ".cursor", "skills", "rdk-docs", "SKILL.md"));
  });

  it("merges ZCode mcp.servers without dropping other servers", () => {
    const root = home();
    mkdirSync(join(root, ".zcode", "cli"), { recursive: true });
    writeFileSync(
      join(root, ".zcode", "cli", "config.json"),
      JSON.stringify({ mcp: { servers: { other: { command: "keep-me" } } } }),
    );
    installRdkDocs({ home: root, skillSource: skillBody });
    const config = JSON.parse(readFileSync(join(root, ".zcode", "cli", "config.json"), "utf8"));
    expect(config.mcp.servers.other.command).toBe("keep-me");
    expect(config.mcp.servers["rdk-docs"]).toEqual({ type: "stdio", ...MCP_SERVER });
    expect(readFileSync(join(root, ".zcode", "skills", "rdk-docs", "SKILL.md"), "utf8")).toContain("# test");
  });

  it("mounts DeepSeek Harness via cordis.patch.yml and user skills", () => {
    const root = home();
    mkdirSync(join(root, ".dsh"));
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    const patch = readFileSync(join(root, ".dsh", "cordis.patch.yml"), "utf8");
    expect(patch).toContain("id: mcp-rdk-docs");
    expect(patch).toContain("@deepseek-ai/dsh-mcp-client");
    expect(patch).toContain("rdk-docs-mcp@latest");
    expect(result.mcp).toContain(join(root, ".dsh", "cordis.patch.yml"));
    expect(readFileSync(join(root, ".dsh", "skills", "rdk-docs", "SKILL.md"), "utf8")).toContain("# test");
    expect(readFileSync(join(root, ".agents", "skills", "rdk-docs", "SKILL.md"), "utf8")).toContain("# test");
  });

  it("does not duplicate the DeepSeek Harness MCP insert", () => {
    const root = home();
    mkdirSync(join(root, ".dsh"));
    writeFileSync(join(root, ".dsh", "cordis.patch.yml"), "- insert:\n    - id: mcp-rdk-docs\n      name: keep\n");
    installRdkDocs({ home: root, skillSource: skillBody });
    const patch = readFileSync(join(root, ".dsh", "cordis.patch.yml"), "utf8");
    expect(patch.match(/id:\s*mcp-rdk-docs/g)?.length).toBe(1);
  });

  it("does nothing when no supported client directory exists", () => {
    const root = home();
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    expect(result.mcp).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("refreshInstalledSkills", () => {
  it("overwrites an already installed Skill and leaves clients without one alone", () => {
    const root = home();
    mkdirSync(join(root, ".cursor", "skills", "rdk-docs"), { recursive: true });
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".cursor", "skills", "rdk-docs", "SKILL.md"), "# stale\n");

    const updated = refreshInstalledSkills({ home: root, skillSource: "# fresh\n" });

    expect(updated).toEqual([join(root, ".cursor", "skills", "rdk-docs", "SKILL.md")]);
    expect(readFileSync(join(root, ".cursor", "skills", "rdk-docs", "SKILL.md"), "utf8")).toBe("# fresh\n");
    expect(existsSync(join(root, ".claude", "skills", "rdk-docs", "SKILL.md"))).toBe(false);
  });

  it("does not write MCP config", () => {
    const root = home();
    mkdirSync(join(root, ".cursor", "skills", "rdk-docs"), { recursive: true });
    writeFileSync(join(root, ".cursor", "skills", "rdk-docs", "SKILL.md"), "# stale\n");
    refreshInstalledSkills({ home: root, skillSource: "# fresh\n" });
    expect(existsSync(join(root, ".cursor", "mcp.json"))).toBe(false);
  });
});

describe("install.md", () => {
  it("tells the agent to run the one-line installer and not clone a repo", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", "install.md");
    const body = readFileSync(path, "utf8");
    expect(body).toContain("npx -y rdk-docs-mcp@latest --install");
    expect(body).toContain("不要 `git clone`");
    expect(body).toContain("cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/SKILL.md");
    expect(body).toContain("~/.zcode/cli/config.json");
    expect(body).toContain("~/.dsh/cordis.patch.yml");
    expect(body).toContain("MCP 启动时");
  });
});
