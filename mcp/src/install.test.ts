import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureCodexMcpServer, installRdkDocs, MCP_SERVER, refreshInstalledSkills } from "./install.js";

const atomicFailure = vi.hoisted(() => ({
  renameTarget: undefined as string | undefined,
  inspectTarget: undefined as string | undefined,
  sourceMode: undefined as number | undefined,
}));

const itPosix = process.platform === "win32" ? it.skip : it;

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync(source: string, destination: string) {
      if (destination === atomicFailure.inspectTarget) {
        atomicFailure.sourceMode = actual.statSync(source).mode & 0o777;
      }
      if (destination === atomicFailure.renameTarget) throw new Error("simulated replacement failure");
      return actual.renameSync(source, destination);
    },
  };
});

afterEach(() => {
  atomicFailure.renameTarget = undefined;
  atomicFailure.inspectTarget = undefined;
  atomicFailure.sourceMode = undefined;
});

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

  it("preserves a usable custom Cursor server entry byte-for-byte", () => {
    const root = home();
    const configPath = join(root, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    const original = `${JSON.stringify(
      {
        mcpServers: {
          "rdk-docs": {
            command: "/opt/custom/npx",
            args: ["rdk-docs-mcp@0.1.12"],
            env: { RDK_DOCS_CACHE_TTL_MS: "0" },
            disabled: true,
          },
          other: { command: "keep" },
        },
      },
      null,
      4,
    )}\n`;
    writeFileSync(configPath, original);

    const result = installRdkDocs({ home: root, skillSource: skillBody });

    expect(readFileSync(configPath, "utf8")).toBe(original);
    expect(result.warnings.join("\n")).toMatch(/preserved.*custom.*rdk-docs/i);
  });

  it("preserves a usable custom ZCode server entry byte-for-byte", () => {
    const root = home();
    const configPath = join(root, ".zcode", "cli", "config.json");
    mkdirSync(dirname(configPath), { recursive: true });
    const original = `${JSON.stringify(
      {
        mcp: {
          servers: {
            "rdk-docs": {
              type: "stdio",
              command: "/opt/custom/npx",
              args: ["rdk-docs-mcp@0.1.12"],
              env: { RDK_DOCS_CACHE_TTL_MS: "0" },
              disabled: true,
            },
            other: { command: "keep" },
          },
        },
      },
      null,
      4,
    )}\n`;
    writeFileSync(configPath, original);

    const result = installRdkDocs({ home: root, skillSource: skillBody });

    expect(readFileSync(configPath, "utf8")).toBe(original);
    expect(result.warnings.join("\n")).toMatch(/preserved.*custom.*rdk-docs/i);
  });

  it.each([
    {
      client: "Cursor mcpServers",
      directory: ".cursor",
      relativePath: "mcp.json",
      original: '{"mcpServers":[]}\n',
      expected: /mcpServers.*object/i,
    },
    {
      client: "ZCode mcp",
      directory: ".zcode",
      relativePath: join("cli", "config.json"),
      original: '{"mcp":[]}\n',
      expected: /mcp.*object/i,
    },
    {
      client: "ZCode servers",
      directory: ".zcode",
      relativePath: join("cli", "config.json"),
      original: '{"mcp":{"servers":[]}}\n',
      expected: /servers.*object/i,
    },
  ])("refuses a malformed $client container without changing bytes", ({ directory, relativePath, original, expected }) => {
    const root = home();
    const configPath = join(root, directory, relativePath);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, original);

    expect(() => installRdkDocs({ home: root, skillSource: skillBody })).toThrow(expected);
    expect(readFileSync(configPath, "utf8")).toBe(original);
  });

  it.each([
    {
      client: "Cursor numeric command",
      directory: ".cursor",
      relativePath: "mcp.json",
      original: '{"mcpServers":{"rdk-docs":{"command":42}}}\n',
      expected: /rdk-docs.*command.*string/i,
    },
    {
      client: "ZCode non-array args",
      directory: ".zcode",
      relativePath: join("cli", "config.json"),
      original: '{"mcp":{"servers":{"rdk-docs":{"type":"stdio","command":"npx","args":42}}}}\n',
      expected: /rdk-docs.*args.*array.*strings/i,
    },
  ])("refuses malformed launch fields for $client without changing bytes", ({ directory, relativePath, original, expected }) => {
    const root = home();
    const configPath = join(root, directory, relativePath);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, original);

    expect(() => installRdkDocs({ home: root, skillSource: skillBody })).toThrow(expected);
    expect(readFileSync(configPath, "utf8")).toBe(original);
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

  it("preserves the original Skill when atomic replacement fails", () => {
    const root = home();
    const skillPath = join(root, ".cursor", "skills", "rdk-docs", "SKILL.md");
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, "# original\n");
    atomicFailure.renameTarget = skillPath;

    expect(() => refreshInstalledSkills({ home: root, skillSource: "# replacement\n" })).toThrow(
      /simulated replacement failure/,
    );
    expect(readFileSync(skillPath, "utf8")).toBe("# original\n");
  });
});

describe("atomic installer files", () => {
  itPosix("preserves restrictive permissions when replacing an existing config", () => {
    const root = home();
    const configPath = join(root, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, '{"mcpServers":{}}\n');
    chmodSync(configPath, 0o600);
    atomicFailure.inspectTarget = configPath;

    installRdkDocs({ home: root, skillSource: skillBody });

    expect(atomicFailure.sourceMode).toBe(0o600);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  itPosix("creates new installer-managed files with restrictive permissions", () => {
    const root = home();
    const configPath = join(root, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    atomicFailure.inspectTarget = configPath;

    installRdkDocs({ home: root, skillSource: skillBody });

    expect(atomicFailure.sourceMode).toBe(0o600);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  });

  it("preserves the original JSON config when atomic replacement fails", () => {
    const root = home();
    const configPath = join(root, ".cursor", "mcp.json");
    mkdirSync(dirname(configPath), { recursive: true });
    const original = '{"mcpServers":{"keep":{"command":"keep"}}}\n';
    writeFileSync(configPath, original);
    atomicFailure.renameTarget = configPath;

    expect(() => installRdkDocs({ home: root, skillSource: skillBody })).toThrow(/simulated replacement failure/);
    expect(readFileSync(configPath, "utf8")).toBe(original);
  });

  it("preserves the original DSH patch when atomic replacement fails", () => {
    const root = home();
    const patchPath = join(root, ".dsh", "cordis.patch.yml");
    mkdirSync(dirname(patchPath), { recursive: true });
    const original = "# original patch\n";
    writeFileSync(patchPath, original);
    atomicFailure.renameTarget = patchPath;

    expect(() => installRdkDocs({ home: root, skillSource: skillBody })).toThrow(/simulated replacement failure/);
    expect(readFileSync(patchPath, "utf8")).toBe(original);
  });
});

describe("multi-skill", () => {
  const twoSkills = [
    { name: "rdk-docs", body: "---\nname: rdk-docs\n---\n# docs\n" },
    { name: "forum-post", body: "---\nname: forum-post\n---\n# forum\n" },
    { name: "article-writer", body: "---\nname: article-writer\n---\n# writer\n" },
  ];

  it("installs every bundled skill into a present client dir", () => {
    const root = home();
    mkdirSync(join(root, ".codex"));
    const result = installRdkDocs({ home: root, skillsSource: twoSkills });
    for (const s of twoSkills) {
      expect(readFileSync(join(root, ".codex", "skills", s.name, "SKILL.md"), "utf8")).toContain(s.name);
      expect(result.skills).toContain(join(root, ".codex", "skills", s.name, "SKILL.md"));
    }
  });

  it("refresh updates only skills that already exist on disk", () => {
    const root = home();
    // rdk-docs exists, forum-post does not
    mkdirSync(join(root, ".codex", "skills", "rdk-docs"), { recursive: true });
    writeFileSync(join(root, ".codex", "skills", "rdk-docs", "SKILL.md"), "# stale\n");
    const updated = refreshInstalledSkills({ home: root, skillsSource: twoSkills });
    expect(updated).toEqual([join(root, ".codex", "skills", "rdk-docs", "SKILL.md")]);
    expect(existsSync(join(root, ".codex", "skills", "forum-post", "SKILL.md"))).toBe(false);
  });

  it("loadBundledSkills falls back to the root SKILL.md when no skills/ dir", () => {
    // point at a temp dir with only a root SKILL.md
    // (loadBundledSkills reads relative to the package; here we just assert the
    // fallback contract via resolveSkills path used by install)
    const root = home();
    mkdirSync(join(root, ".codex"));
    const result = installRdkDocs({ home: root, skillSource: "single-skill-body" });
    expect(readFileSync(join(root, ".codex", "skills", "rdk-docs", "SKILL.md"), "utf8")).toBe("single-skill-body");
  });
});

describe("Codex MCP registration (issue #5)", () => {
  it("registers the Codex MCP in config.toml on a Codex-only machine", () => {
    const root = home();
    mkdirSync(join(root, ".codex"));
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    const toml = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.rdk-docs]");
    expect(toml).toContain('command = "npx"');
    expect(toml).toContain('"rdk-docs-mcp@latest"');
    expect(result.mcp).toContain(join(root, ".codex", "config.toml"));
    expect(result.warnings).toEqual([]);
  });

  it("keeps existing Codex config intact and never duplicates the entry", () => {
    const root = home();
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "foo"\n',
    );
    installRdkDocs({ home: root, skillSource: skillBody });
    installRdkDocs({ home: root, skillSource: skillBody });
    const toml = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(toml).toContain('model = "gpt-5"');
    expect(toml).toContain("[mcp_servers.other]");
    expect(toml.match(/\[mcp_servers\.rdk-docs\]/g)?.length).toBe(1);
  });

  it("leaves a user-customized rdk-docs entry untouched", () => {
    const root = home();
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      '[mcp_servers.rdk-docs]\ncommand = "/custom/path/npx"\nargs = ["-y", "rdk-docs-mcp@1.2.3"]\n',
    );
    installRdkDocs({ home: root, skillSource: skillBody });
    const toml = readFileSync(join(root, ".codex", "config.toml"), "utf8");
    expect(toml).toContain('"/custom/path/npx"');
    expect(toml).not.toContain('command = "npx"');
  });

  it("warns instead of ending silently when only skills could be written", () => {
    const root = home();
    mkdirSync(join(root, ".claude"));
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    expect(result.mcp).toEqual([]);
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("no MCP server configuration");
  });

  it("rejects an invalid JSON client config instead of silently overwriting it", () => {
    const root = home();
    mkdirSync(join(root, ".cursor"));
    writeFileSync(join(root, ".cursor", "mcp.json"), "{ not valid json");
    expect(() => installRdkDocs({ home: root, skillSource: skillBody })).toThrow(/Invalid JSON configuration/);
    expect(readFileSync(join(root, ".cursor", "mcp.json"), "utf8")).toBe("{ not valid json");
  });
});

describe("Codex MCP registration — TOML semantics (retest 2026-09-21)", () => {
  /** Temp HOME with a ~/.codex/config.toml seeded with `initial` (if given). */
  function codexConfig(initial?: string): string {
    const root = mkdtempSync(join(tmpdir(), "rdk-docs-codex-"));
    mkdirSync(join(root, ".codex"), { recursive: true });
    const config = join(root, ".codex", "config.toml");
    if (initial !== undefined) writeFileSync(config, initial);
    return config;
  }

  function serverEntry(toml: string): Record<string, unknown> {
    const parsed = parseToml(toml) as { mcp_servers?: Record<string, Record<string, unknown>> };
    return parsed.mcp_servers?.["rdk-docs"] ?? {};
  }

  it("treats a quoted table header as registered and never appends a duplicate", () => {
    const initial = '["mcp_servers"."rdk-docs"]\ncommand = "custom"\nargs = []\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    expect(readFileSync(config, "utf8")).toBe(initial);
    expect(serverEntry(readFileSync(config, "utf8")).command).toBe("custom");
  });

  it("does not treat a pseudo header inside a multi-line string as registered", () => {
    const initial = 'note = """\nlooks like [mcp_servers.rdk-docs] but is prose\n"""\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    const toml = readFileSync(config, "utf8");
    const parsed = parseToml(toml) as { note?: string; mcp_servers?: Record<string, Record<string, unknown>> };
    expect((parsed.note as string).includes("[mcp_servers.rdk-docs]")).toBe(true);
    expect(parsed.mcp_servers?.["rdk-docs"]?.command).toBe("npx");
  });

  it("completes an empty trailing [mcp_servers.rdk-docs] table with launch keys", () => {
    const initial = 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "foo"\n\n[mcp_servers.rdk-docs]\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    const parsed = parseToml(readFileSync(config, "utf8")) as {
      model?: string;
      mcp_servers?: Record<string, Record<string, unknown>>;
    };
    expect(parsed.mcp_servers?.["rdk-docs"]?.command).toBe("npx");
    expect(parsed.mcp_servers?.["rdk-docs"]?.args).toEqual(["-y", "rdk-docs-mcp@latest"]);
    expect(parsed.mcp_servers?.other?.command).toBe("foo");
    expect(parsed.model).toBe("gpt-5");
  });

  it("reports an entry it cannot safely complete instead of claiming success", () => {
    // The empty rdk-docs table is NOT the last table, so appending launch keys
    // would attach them to [mcp_servers.other]. This must be reported, not written.
    const initial = '[mcp_servers.rdk-docs]\n\n[mcp_servers.other]\ncommand = "foo"\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(false);
    expect(result.detail).toMatch(/command|url/);
    expect(readFileSync(config, "utf8")).toBe(initial);
  });

  it("leaves an invalid TOML file untouched and reports the parse failure", () => {
    const initial = "[mcp_servers.rdk-docs\ncommand = oops\n";
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(false);
    expect(result.detail).toMatch(/valid TOML/i);
    expect(readFileSync(config, "utf8")).toBe(initial);
  });

  it("accepts a url-only entry as usable and leaves it alone", () => {
    const initial = '[mcp_servers.rdk-docs]\nurl = "http://localhost:8080/mcp"\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    expect(readFileSync(config, "utf8")).toBe(initial);
  });

  it("recognizes dotted-key and inline-table definitions without duplicating them", () => {
    const dotted = 'model = "gpt-5"\nmcp_servers.rdk-docs.command = "custom-runner"\n';
    const configDotted = codexConfig(dotted);
    expect(ensureCodexMcpServer(configDotted).registered).toBe(true);
    expect(readFileSync(configDotted, "utf8")).toBe(dotted);

    const inline = 'mcp_servers = { "rdk-docs" = { command = "custom-runner" } }\n';
    const configInline = codexConfig(inline);
    expect(ensureCodexMcpServer(configInline).registered).toBe(true);
    expect(readFileSync(configInline, "utf8")).toBe(inline);
  });

  it("appends a parseable block to a valid config and keeps every other entry", () => {
    const initial = 'model = "gpt-5"\n\n# user comment\n[profiles.dev]\nverbose = true\n';
    const config = codexConfig(initial);
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    const toml = readFileSync(config, "utf8");
    expect(toml.startsWith(initial)).toBe(true); // append-only, no rewrite
    expect(toml).toContain("# user comment");
    const parsed = parseToml(toml) as {
      model?: string;
      profiles?: Record<string, unknown>;
      mcp_servers?: Record<string, Record<string, unknown>>;
    };
    expect(parsed.model).toBe("gpt-5");
    expect((parsed.profiles?.dev as Record<string, unknown>)?.verbose).toBe(true);
    expect(parsed.mcp_servers?.["rdk-docs"]?.command).toBe("npx");
  });

  it("creates a parseable config from scratch", () => {
    const config = codexConfig();
    const result = ensureCodexMcpServer(config);
    expect(result.registered).toBe(true);
    expect(serverEntry(readFileSync(config, "utf8")).command).toBe("npx");
  });

  it("warns through installRdkDocs when the codex config is invalid TOML", () => {
    const root = mkdtempSync(join(tmpdir(), "rdk-docs-codex-"));
    mkdirSync(join(root, ".codex"), { recursive: true });
    const configPath = join(root, ".codex", "config.toml");
    const initial = "[this is = not toml\n";
    writeFileSync(configPath, initial);
    const result = installRdkDocs({ home: root, skillSource: skillBody });
    expect(result.mcp).not.toContain(configPath);
    expect(result.warnings.join("\n")).toMatch(/valid TOML/);
    expect(readFileSync(configPath, "utf8")).toBe(initial);
    // skills are still installed for that client
    expect(readFileSync(join(root, ".codex", "skills", "rdk-docs", "SKILL.md"), "utf8")).toContain("# test");
  });
});

describe("install.md", () => {
  it("tells the agent to run the one-line installer and not clone a repo", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "..", "install.md");
    const body = readFileSync(path, "utf8");
    expect(body).toContain("npx -y rdk-docs-mcp@latest --install");
    expect(body).toContain("不要 `git clone`");
    expect(body).toContain("cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/skills/$s/SKILL.md");
    expect(body).toContain("~/.zcode/cli/config.json");
    expect(body).toContain("~/.dsh/cordis.patch.yml");
    expect(body).toContain("MCP 启动时");
  });
});
