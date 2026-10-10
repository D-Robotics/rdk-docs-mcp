import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`Invalid JSON configuration at ${path}: expected an object`);
  return parsed as JsonObject;
}

/**
 * Back up an existing config before the installer changes it. The first run
 * writes `<file>.bak`; an existing `.bak` (the user's own, or the pre-install
 * state from an earlier run) is never overwritten. A later run that changes
 * the file again writes `<file>.bak.<timestamp>` instead, so no earlier
 * state is lost. Returns the backup path, or undefined when nothing changes.
 */
export function backupBeforeWrite(path: string, next: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const current = readFileSync(path, "utf8");
  if (current === next) return undefined;
  const primary = `${path}.bak`;
  if (!existsSync(primary)) {
    copyFileSync(path, primary);
    return primary;
  }
  if (readFileSync(primary, "utf8") === current) return primary;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  let target = `${primary}.${stamp}`;
  for (let n = 1; existsSync(target); n++) target = `${primary}.${stamp}-${n}`;
  copyFileSync(path, target);
  return target;
}

function writeJson(path: string, value: JsonObject): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  backupBeforeWrite(path, body);
  writeFileSync(path, body);
}

/**
 * Merge the rdk-docs entry into a JSON `servers` map. A usable existing entry
 * (any command or url, e.g. Windows `cmd /c npx ...` or a `--registry` mirror)
 * is kept as is and the file is not rewritten, so its formatting survives too.
 * Only a missing or unlaunchable entry is (re)written. Returns true if the
 * file was written.
 */
function ensureJsonServer(
  path: string,
  config: JsonObject,
  servers: JsonObject,
  entry: JsonObject,
  attach: () => void,
): boolean {
  if (isUsableServerEntry(servers["rdk-docs"])) return false;
  servers["rdk-docs"] = entry;
  attach();
  writeJson(path, config);
  return true;
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
    ...SKILL_ONLY_CLIENTS.map((client) => join(home, ...client.skills)),
  ];
}

/**
 * Clients whose MCP registration the installer does not write, but whose
 * user-level skills directory is documented. Skills land only when the
 * client's own config root already exists (same rule as the MCP clients).
 */
export const SKILL_ONLY_CLIENTS: { name: string; root: string[]; skills: string[] }[] = [
  { name: "Gemini CLI", root: [".gemini"], skills: [".gemini", "skills"] },
  { name: "Google Antigravity", root: [".gemini", "config"], skills: [".gemini", "config", "skills"] },
  { name: "Google Antigravity (legacy)", root: [".gemini", "antigravity"], skills: [".gemini", "antigravity", "skills"] },
  { name: "Antigravity CLI", root: [".gemini", "antigravity-cli"], skills: [".gemini", "antigravity-cli", "skills"] },
  { name: "Windsurf", root: [".codeium", "windsurf"], skills: [".codeium", "windsurf", "skills"] },
  { name: "Devin Desktop", root: [".config", "devin"], skills: [".config", "devin", "skills"] },
  { name: "OpenClaw", root: [".openclaw"], skills: [".openclaw", "skills"] },
  { name: "QoderWork", root: [".qoderwork"], skills: [".qoderwork", "skills"] },
  { name: "workbuddy", root: [".workbuddy"], skills: [".workbuddy", "skills"] },
];

export function skillInstallPaths(home: string, skillName: string = DEFAULT_SKILL): string[] {
  return clientSkillBases(home).map((base) => join(base, skillName, "SKILL.md"));
}

export function ensureDshMcpPatch(path: string): boolean {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (/id:\s*mcp-rdk-docs\b/.test(existing)) return false;
  const prefix = existing.length === 0 ? "" : existing.endsWith("\n") ? existing : `${existing}\n`;
  const body = `${prefix}${prefix ? "\n" : ""}${DSH_MCP_PATCH}`;
  backupBeforeWrite(path, body);
  writeText(path, body);
  return true;
}

/** Codex keeps MCP servers as TOML tables in ~/.codex/config.toml. */
export const CODEX_MCP_BLOCK = `
[mcp_servers.rdk-docs]
command = "npx"
args = ["-y", "rdk-docs-mcp@latest"]
`;

/** Launch keys only — used to complete an existing table that lacks them. */
const CODEX_MCP_LAUNCH_KEYS = `command = "npx"
args = ["-y", "rdk-docs-mcp@latest"]
`;

export type CodexMcpEnsureResult = {
  registered: boolean;
  /** Human-readable outcome; the reason whenever `registered` is false. */
  detail: string;
};

/** Codex can launch a server over stdio (`command`) or HTTP (`url`). */
function isUsableServerEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const { command, url } = entry as { command?: unknown; url?: unknown };
  if (typeof command === "string" && command.trim() !== "") return true;
  if (typeof url === "string" && url.trim() !== "") return true;
  return false;
}

/** The mcp_servers.rdk-docs table of a parsed config, when it is a table. */
function codexServerEntry(parsed: unknown): JsonObject | undefined {
  const servers = (parsed as JsonObject | undefined)?.mcp_servers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return undefined;
  const entry = (servers as JsonObject)["rdk-docs"];
  return entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as JsonObject) : undefined;
}

/**
 * Every key path of `original` must survive in `updated` with the same value.
 * Extra keys in `updated` are fine — this is the append-only preservation check.
 */
function tomlCovers(original: unknown, updated: unknown): boolean {
  if (original instanceof Date || updated instanceof Date) {
    return original instanceof Date && updated instanceof Date && original.getTime() === updated.getTime();
  }
  if (Array.isArray(original)) {
    return (
      Array.isArray(updated) &&
      updated.length >= original.length &&
      original.every((value, index) => tomlCovers(value, updated[index]))
    );
  }
  if (original && typeof original === "object") {
    if (!updated || typeof updated !== "object" || Array.isArray(updated)) return false;
    return Object.keys(original).every(
      (key) => key in (updated as JsonObject) && tomlCovers((original as JsonObject)[key], (updated as JsonObject)[key]),
    );
  }
  return Object.is(original, updated);
}

/** Parse TOML or throw with the parser's message (caller reports it verbatim). */
function parseCodexConfig(toml: string): JsonObject {
  const parsed = parseToml(toml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("top-level value is not a table");
  }
  return parsed as JsonObject;
}

/** Write `body` to `path` via temp-file + rename so a crash never truncates it. */
function writeTextAtomic(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.rdk-tmp`;
  try {
    writeFileSync(tmp, body);
    renameSync(tmp, path);
  } catch (error) {
    try {
      if (existsSync(tmp)) renameSync(tmp, `${tmp}.discarded`);
    } catch {
      /* best-effort cleanup */
    }
    throw error;
  }
}

/**
 * Register the rdk-docs MCP server in Codex's config.toml with real TOML
 * semantics (quoted keys, dotted keys, inline tables, multi-line strings are
 * all handled by the parser, not by header guessing):
 *
 * - a usable existing entry (command or url) is left byte-for-byte untouched;
 * - a missing entry is appended; an entry that exists without launch keys is
 *   completed only when appending at end-of-file provably lands the keys in
 *   that table (verified by re-parsing the candidate content first);
 * - the file is only ever appended to — never rewritten — and an invalid or
 *   unfixable original is reported and left untouched;
 * - writes are atomic and read back + re-parsed before success is claimed.
 */
export function ensureCodexMcpServer(path: string): CodexMcpEnsureResult {
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";

  let parsed: JsonObject = {};
  if (existing.trim() !== "") {
    try {
      parsed = parseCodexConfig(existing);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        registered: false,
        detail: `Left ${path} untouched: it is not valid TOML (${message}).`,
      };
    }
  }

  const entry = codexServerEntry(parsed);
  if (entry && isUsableServerEntry(entry)) {
    return { registered: true, detail: `rdk-docs was already registered in ${path}; left untouched.` };
  }

  // Build the candidate content. When the table exists but cannot launch, the
  // only lossless edit is appending the missing keys at end-of-file — which is
  // correct only when that table is the last one in the file. The candidate
  // re-parse below proves where the keys landed before anything is written.
  let candidate: string;
  if (entry) {
    const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    candidate = `${existing}${separator}${CODEX_MCP_LAUNCH_KEYS}`;
  } else {
    const prefix = existing.length === 0 ? "" : existing.endsWith("\n") ? existing : `${existing}\n`;
    candidate = existing.length === 0 ? CODEX_MCP_BLOCK.trimStart() : `${prefix}${CODEX_MCP_BLOCK}`;
  }

  let candidateParsed: JsonObject;
  try {
    candidateParsed = parseCodexConfig(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      registered: false,
      detail: `Left ${path} untouched: adding the rdk-docs server would make it invalid TOML (${message}).`,
    };
  }
  const candidateEntry = codexServerEntry(candidateParsed);
  if (!candidateEntry || !isUsableServerEntry(candidateEntry) || !tomlCovers(parsed, candidateParsed)) {
    return {
      registered: false,
      detail: `Left ${path} untouched: [mcp_servers.rdk-docs] exists without a usable command/url and completing it automatically is not safe.`,
    };
  }

  try {
    backupBeforeWrite(path, candidate);
    writeTextAtomic(path, candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { registered: false, detail: `Could not write ${path}: ${message}.` };
  }

  // Read back and re-parse: only a verifiably usable on-disk state counts.
  try {
    const reread = readFileSync(path, "utf8");
    const reparsed = parseCodexConfig(reread);
    if (!isUsableServerEntry(codexServerEntry(reparsed))) {
      throw new Error("the rdk-docs server entry is missing or not usable after writing");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      writeTextAtomic(path, existing); // restore the pre-existing content
    } catch {
      /* best-effort restore */
    }
    return {
      registered: false,
      detail: `Verification of ${path} after writing failed (${message}); restored the original content.`,
    };
  }

  return entry
    ? { registered: true, detail: `Completed the launch keys of the existing [mcp_servers.rdk-docs] table in ${path}.` }
    : { registered: true, detail: `Appended [mcp_servers.rdk-docs] to ${path}.` };
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
    ensureJsonServer(mcpPath, mcp, servers, { ...MCP_SERVER }, () => {
      mcp.mcpServers = servers;
    });
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
    ensureJsonServer(configPath, config, servers, { type: "stdio", ...MCP_SERVER }, () => {
      mcp.servers = servers;
      config.mcp = mcp;
    });
    result.mcp.push(configPath);
    writeSkills(join(zcode, "skills"));
    // ZCode also reads the shared agents dir.
    writeSkills(join(home, ".agents", "skills"));
  }

  const codex = join(home, ".codex");
  if (existsSync(codex)) {
    writeSkills(join(codex, "skills"));
    const configPath = join(codex, "config.toml");
    const codexResult = ensureCodexMcpServer(configPath);
    if (codexResult.registered) {
      result.mcp.push(configPath);
    } else {
      result.warnings.push(
        `${codexResult.detail} Finish manually: codex mcp add rdk-docs -- npx -y rdk-docs-mcp@latest`,
      );
    }
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

  for (const client of SKILL_ONLY_CLIENTS) {
    if (existsSync(join(home, ...client.root))) writeSkills(join(home, ...client.skills));
  }

  if (result.mcp.length === 0 && result.skills.length === 0) {
    result.warnings.push(
      "No Cursor / Claude / ZCode / Codex / DeepSeek Harness directory found. Create one, or merge the MCP snippet from install.md yourself.",
    );
  }
  // Skills without MCP leave the agent with instructions but no tools; say so
  // instead of ending silently (Claude Code has no file-based MCP registration).
  if (result.mcp.length === 0 && result.skills.length > 0) {
    result.warnings.push(
      "Skills were written, but no MCP server configuration could be written for any client. Register the MCP manually (see install.md), or the rdk-docs tools stay unavailable.",
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
  if (result.mcp.length === 0)
    lines.push("No MCP client configuration was written; Skills alone do not provide MCP tools.");
  lines.push("Reload the Agent / MCP servers, then ask: `RDK X5 怎么烧录？`");
  lines.push("Read search snippets and decide relevance yourself. noGoodMatch is only set when a command, package, API, or error code is absent from the manuals and the top hit. Do not clone the source repository.");
  return lines.join("\n");
}
