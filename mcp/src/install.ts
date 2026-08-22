import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MCP_SERVER = {
  command: "npx",
  args: ["-y", "rdk-docs-mcp@latest"],
} as const;

export type InstallResult = {
  mcp: string[];
  skills: string[];
  warnings: string[];
};

export type InstallOptions = {
  home?: string;
  skillSource?: string;
};

type JsonObject = Record<string, unknown>;

function readJson(path: string): JsonObject {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : {};
  } catch {
    return {};
  }
}

function writeJson(path: string, value: JsonObject): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function bundledSkillPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md");
}

export function loadBundledSkill(): string {
  const path = bundledSkillPath();
  if (!existsSync(path)) {
    throw new Error(`SKILL.md missing next to the package (looked for ${path})`);
  }
  return readFileSync(path, "utf8");
}

export function skillInstallPaths(home: string): string[] {
  return [
    join(home, ".cursor", "skills", "rdk-docs", "SKILL.md"),
    join(home, ".claude", "skills", "rdk-docs", "SKILL.md"),
    join(home, ".zcode", "skills", "rdk-docs", "SKILL.md"),
    join(home, ".agents", "skills", "rdk-docs", "SKILL.md"),
    join(home, ".codex", "skills", "rdk-docs", "SKILL.md"),
  ];
}

/** Overwrite Skill copies that are already on disk. Used on every MCP startup. */
export function refreshInstalledSkills(options: InstallOptions = {}): string[] {
  const home = options.home ?? homedir();
  const skill = options.skillSource ?? loadBundledSkill();
  const updated: string[] = [];
  for (const path of skillInstallPaths(home)) {
    if (!existsSync(path) && !existsSync(dirname(path))) continue;
    writeText(path, skill);
    updated.push(path);
  }
  return updated;
}

export function refreshInstalledSkillsOnStart(): void {
  try {
    const updated = refreshInstalledSkills();
    if (updated.length > 0) {
      console.error(`rdk-docs-mcp refreshed ${updated.length} Skill file(s)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`rdk-docs-mcp skill refresh skipped: ${message}`);
  }
}

export function installRdkDocs(options: InstallOptions = {}): InstallResult {
  const home = options.home ?? homedir();
  const skill = options.skillSource ?? loadBundledSkill();
  const result: InstallResult = { mcp: [], skills: [], warnings: [] };

  const cursor = join(home, ".cursor");
  if (existsSync(cursor)) {
    const mcpPath = join(cursor, "mcp.json");
    const mcp = readJson(mcpPath);
    const servers = asObject(mcp.mcpServers);
    servers["rdk-docs"] = { ...MCP_SERVER };
    mcp.mcpServers = servers;
    writeJson(mcpPath, mcp);
    result.mcp.push(mcpPath);
    const skillPath = join(cursor, "skills", "rdk-docs", "SKILL.md");
    writeText(skillPath, skill);
    result.skills.push(skillPath);
  }

  const claude = join(home, ".claude");
  if (existsSync(claude)) {
    const skillPath = join(claude, "skills", "rdk-docs", "SKILL.md");
    writeText(skillPath, skill);
    result.skills.push(skillPath);
  }

  const zcode = join(home, ".zcode");
  if (existsSync(zcode)) {
    const configPath = join(zcode, "cli", "config.json");
    const config = readJson(configPath);
    const mcp = asObject(config.mcp);
    const servers = asObject(mcp.servers);
    servers["rdk-docs"] = { type: "stdio", ...MCP_SERVER };
    mcp.servers = servers;
    config.mcp = mcp;
    writeJson(configPath, config);
    result.mcp.push(configPath);
    const skillPath = join(zcode, "skills", "rdk-docs", "SKILL.md");
    writeText(skillPath, skill);
    result.skills.push(skillPath);
    const agentsSkill = join(home, ".agents", "skills", "rdk-docs", "SKILL.md");
    writeText(agentsSkill, skill);
    result.skills.push(agentsSkill);
  }

  const codex = join(home, ".codex");
  if (existsSync(codex)) {
    const skillPath = join(codex, "skills", "rdk-docs", "SKILL.md");
    writeText(skillPath, skill);
    result.skills.push(skillPath);
  }

  if (result.mcp.length === 0 && result.skills.length === 0) {
    result.warnings.push(
      "No Cursor / Claude / ZCode / Codex directory found. Create one, or merge the MCP snippet from install.md yourself.",
    );
  }

  return result;
}

export function formatInstallReport(result: InstallResult): string {
  const lines = ["# RDK Docs installed", ""];
  if (result.mcp.length) {
    lines.push("MCP written:");
    for (const path of result.mcp) lines.push(`- ${path}`);
    lines.push("");
  }
  if (result.skills.length) {
    lines.push("Skill written:");
    for (const path of result.skills) lines.push(`- ${path}`);
    lines.push("");
  }
  if (result.warnings.length) {
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  lines.push("Reload the Agent / MCP servers, then ask: 「RDK X5 怎么烧录？」");
  lines.push("Open the `official-start` hit first. Do not clone the source repository.");
  return lines.join("\n");
}
