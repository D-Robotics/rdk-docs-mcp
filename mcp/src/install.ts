import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MCP_SERVER = {
  command: "npx",
  args: ["-y", "rdk-docs-mcp@latest"],
} as const;

/** Home-level DSH patch so every profile picks up the MCP client bridge. */
export const DSH_MCP_PATCH = `- insert:
    - id: mcp-rdk-docs
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rdk-docs
        transport: stdio
        command: npx
        args: ['-y', 'rdk-docs-mcp@latest']
`;

export type InstallResult = {
  mcp: string[];
  skills: string[];
  warnings: string[];
};

export type InstallOptions = {
  home?: string;
  /** Legacy single-skill injection (tests): one body string for the default skill. */
  skillSource?: string;
  /** Multi-skill injection: explicit set of {name, body} to install instead of the bundle. */
  skillsSource?: BundledSkill[];
};

export type BundledSkill = {
  name: string;
  body: string;
};

/** The skill the MCP server pairs with (and the legacy single-skill fallback name). */
const DEFAULT_SKILL = "rdk-docs";

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

// ---------------------------------------------------------------------------
// Bundled skills: the package ships a `skills/` dir with one subdir per skill
// (skills/<name>/SKILL.md). The legacy root SKILL.md is kept as the fallback.
// ---------------------------------------------------------------------------

export function bundledSkillsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
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

/** All skills bundled in the package: one entry per skills/<name>/SKILL.md. */
export function loadBundledSkills(): BundledSkill[] {
  const dir = bundledSkillsDir();
  const out: BundledSkill[] = [];
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir)) {
      const skillFile = join(dir, entry, "SKILL.md");
      if (existsSync(skillFile)) {
        out.push({ name: entry, body: readFileSync(skillFile, "utf8") });
      }
    }
  }
  if (out.length === 0) {
    // Legacy single-file package (only root SKILL.md).
    out.push({ name: DEFAULT_SKILL, body: loadBundledSkill() });
  }
  return out;
}

/** Resolve the working skill set: explicit injection wins, else the bundle. */
function resolveSkills(options: InstallOptions): BundledSkill[] {
  if (options.skillsSource && options.skillsSource.length > 0) return options.skillsSource;
  if (options.skillSource) return [{ name: DEFAULT_SKILL, body: options.skillSource }];
  return loadBundledSkills();
}

/** Client skill-dir bases (each client keeps skills under <base>/<name>/SKILL.md). */
function clientSkillBases(home: string): string[] {
  return [
    join(home, ".cursor", "skills"),
    join(home, ".claude", "skills"),
    join(home, ".zcode", "skills"),
    join(home, ".agents", "skills"),
    join(home, ".codex", "skills"),
    join(home, ".dsh", "skills"),
  ];
}

export function skillInstallPaths(home: string, skillName: string = DEFAULT_SKILL): string[] {
  return clientSkillBases(home).map((base) => join(base, skillName, "SKILL.md"));
}

export function ensureDshMcpPatch(path: string): boolean {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/id:\s*mcp-rdk-docs\b/.test(existing)) return false;
  const prefix = existing.length === 0 ? "" : existing.endsWith("\n") ? existing : `${existing}\n`;
  writeText(path, `${prefix}${prefix ? "\n" : ""}${DSH_MCP_PATCH}`);
  return true;
}

/**
 * Overwrite installed copies of every bundled skill on disk. A skill only lands
 * where it already exists (refresh updates, never installs fresh on startup).
 */
export function refreshInstalledSkills(options: InstallOptions = {}): string[] {
  const home = options.home ?? homedir();
  const skills = resolveSkills(options);
  const updated: string[] = [];
  for (const skill of skills) {
    for (const path of skillInstallPaths(home, skill.name)) {
      if (!existsSync(path) && !existsSync(dirname(path))) continue;  // update only
      writeText(path, skill.body);
      updated.push(path);
    }
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
  const skills = resolveSkills(options);
  const result: InstallResult = { mcp: [], skills: [], warnings: [] };

  /** write every bundled skill into a client's skills dir. */
  const writeSkills = (baseDir: string) => {
    for (const skill of skills) {
      const skillPath = join(baseDir, skill.name, "SKILL.md");
      writeText(skillPath, skill.body);
      result.skills.push(skillPath);
    }
  };

  const cursor = join(home, ".cursor");
  if (existsSync(cursor)) {
    const mcpPath = join(cursor, "mcp.json");
    const mcp = readJson(mcpPath);
    const servers = asObject(mcp.mcpServers);
    servers["rdk-docs"] = { ...MCP_SERVER };
    mcp.mcpServers = servers;
    writeJson(mcpPath, mcp);
    result.mcp.push(mcpPath);
    writeSkills(join(cursor, "skills"));
  }

  const claude = join(home, ".claude");
  if (existsSync(claude)) {
    writeSkills(join(claude, "skills"));
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
    writeSkills(join(zcode, "skills"));
    // ZCode also reads the shared agents dir.
    writeSkills(join(home, ".agents", "skills"));
  }

  const codex = join(home, ".codex");
  if (existsSync(codex)) {
    writeSkills(join(codex, "skills"));
  }

  const dsh = join(home, ".dsh");
  if (existsSync(dsh)) {
    const patchPath = join(dsh, "cordis.patch.yml");
    ensureDshMcpPatch(patchPath);
    result.mcp.push(patchPath);
    writeSkills(join(dsh, "skills"));
    const agentsBase = join(home, ".agents", "skills");
    for (const skill of skills) {
      const p = join(agentsBase, skill.name, "SKILL.md");
      if (!result.skills.includes(p)) {
        writeText(p, skill.body);
        result.skills.push(p);
      }
    }
  }

  if (result.mcp.length === 0 && result.skills.length === 0) {
    result.warnings.push(
      "No Cursor / Claude / ZCode / Codex / DeepSeek Harness directory found. Create one, or merge the MCP snippet from install.md yourself.",
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
