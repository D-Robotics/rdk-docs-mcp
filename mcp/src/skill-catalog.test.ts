import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_JSON_BYTES_FOR_TESTS,
  PACK_REGISTRY_PATH,
  SKILL_INDEX_PATH,
  SkillError,
  defaultPackBoardFamilies,
  loadSkillCatalog,
  packBoardFamilies,
  packBoardFamilyIndex,
  resetSkillCatalogState,
  skillSourceUrl,
  hubUsageUrl,
  type CatalogHttp,
  type SkillRecord,
} from "./skill-catalog.js";

const SHA = "08d0a466413f11bbc045ba5e51f626bdb0346373";
const SNAPSHOT_NAME = "skill-catalog-snapshot.json";

const FLAT_SKILL: SkillRecord = {
  name: "rdk-gpio-40pin",
  description: "Use the 40PIN interface on D-Robotics RDK devices.",
  pack: "RDK Device Skills",
  repo: "D-Robotics/rdk-device-skills",
  catalog_path: "skills/rdk-gpio-40pin",
  install_type: "flat",
};

const INSTALLER_SKILL: SkillRecord = {
  name: "rdk-pack-installer",
  description: "Install or upgrade a D-Robotics workspace-integrated Skill Pack.",
  pack: "D-Robotics Skills",
  repo: "D-Robotics/rdk-skills",
  catalog_path: "skills/rdk-pack-installer",
  install_type: "flat",
};

const S_SERIES_SKILL: SkillRecord = {
  name: "__SKILL_j6-plugin-__adaptation",
  description: "为浮点 PyTorch 模型适配 QAT 工具。",
  pack: "OE Tool Chain (S)",
  repo: "D-Robotics/oe-skills-s",
  catalog_path: "skills/oe-skills-s/skills/plugin/j6-plugin-adaptation",
  install_type: "workspace",
};

const X5_WORKSPACE_SKILL: SkillRecord = {
  name: "x5-ptq-deploy",
  description: "编排 ONNX/Caffe 到 X5 bayes-e .bin 的 OE Mapper PTQ 全流程。",
  pack: "OE Tool Chain (X5)",
  repo: "D-Robotics/oe-skills-x5",
  catalog_path: "skills/oe-skills-x5/skills/x5-ptq-deploy",
  install_type: "workspace",
};

const PACKS = [
  {
    name: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    ref: "v1.0.0",
    catalog_dir: "oe-skills-s",
    install_script: "setup.sh",
    workspace_dir: ".horizon",
    verify_paths: [".horizon/VERSION"],
    install_type: "workspace",
  },
  {
    name: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    ref: "v1.0.0",
    catalog_dir: "oe-skills-x5",
    install_script: "setup.sh",
    workspace_dir: ".drobotics",
    verify_paths: [".drobotics/VERSION"],
    install_type: "workspace",
  },
];

function indexFile(skills: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ schema_version: 1, skills, ...extra });
}

function packFile(packs: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ schema_version: 1, packs, ...extra });
}

function defaultSkills(): SkillRecord[] {
  return [FLAT_SKILL, INSTALLER_SKILL, S_SERIES_SKILL, X5_WORKSPACE_SKILL];
}

type FakeRoutes = {
  revisionStatus?: number;
  revisionBody?: string;
  indexStatus?: number;
  indexBody?: string;
  packStatus?: number;
  packBody?: string;
};

/** URL-keyed fake transport; every call is logged for fetch-count assertions. */
function fakeHttp(routes: FakeRoutes, log: string[]): CatalogHttp {
  return async (url: string) => {
    log.push(url);
    if (url.includes("api.github.com")) {
      return { status: routes.revisionStatus ?? 200, body: routes.revisionBody ?? JSON.stringify({ sha: SHA }) };
    }
    if (url.endsWith(SKILL_INDEX_PATH)) {
      return { status: routes.indexStatus ?? 200, body: routes.indexBody ?? indexFile(defaultSkills()) };
    }
    if (url.endsWith(PACK_REGISTRY_PATH)) {
      return { status: routes.packStatus ?? 200, body: routes.packBody ?? packFile(PACKS) };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

async function expectSkillError(promise: Promise<unknown>, code: string): Promise<SkillError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SkillError);
    const typed = error as SkillError;
    expect(typed.code).toBe(code);
    return typed;
  }
  throw new Error(`expected a SkillError with code ${code}, but the call resolved`);
}

describe("skill catalog: schema and loading", () => {
  let cacheDirPath: string;
  let savedCacheDir: string | undefined;
  let savedTtl: string | undefined;
  let nowMs: number;

  beforeEach(() => {
    resetSkillCatalogState();
    cacheDirPath = mkdtempSync(join(tmpdir(), "rdk-skill-catalog-"));
    savedCacheDir = process.env.RDK_DOCS_CACHE_DIR;
    savedTtl = process.env.RDK_DOCS_CACHE_TTL_MS;
    process.env.RDK_DOCS_CACHE_DIR = cacheDirPath;
    delete process.env.RDK_DOCS_CACHE_TTL_MS;
    nowMs = 1_700_000_000_000;
  });

  afterEach(() => {
    resetSkillCatalogState();
    rmSync(cacheDirPath, { recursive: true, force: true });
    if (savedCacheDir === undefined) delete process.env.RDK_DOCS_CACHE_DIR;
    else process.env.RDK_DOCS_CACHE_DIR = savedCacheDir;
    if (savedTtl === undefined) delete process.env.RDK_DOCS_CACHE_TTL_MS;
    else process.env.RDK_DOCS_CACHE_TTL_MS = savedTtl;
  });

  const load = (routes: FakeRoutes = {}, log: string[] = []) =>
    loadSkillCatalog({ httpGet: fakeHttp(routes, log), now: () => nowMs });

  it("fetches the revision first, then both JSON files from that exact SHA", async () => {
    const log: string[] = [];
    const result = await load({}, log);
    expect(result.from_cache).toBe(false);
    expect(result.snapshot.revision).toBe(SHA);
    expect(result.snapshot.fetched_at).toBe(new Date(nowMs).toISOString());
    expect(result.snapshot.skills.map((skill) => skill.name)).toEqual(defaultSkills().map((s) => s.name));
    expect(result.snapshot.packs).toHaveLength(2);
    expect(log[0]).toContain("api.github.com/repos/D-Robotics/rdk-skills/commits/HEAD");
    expect(log.slice(1).every((url) => url.includes(`/${SHA}/`))).toBe(true);
    expect(log.some((url) => url.endsWith(SKILL_INDEX_PATH))).toBe(true);
    expect(log.some((url) => url.endsWith(PACK_REGISTRY_PATH))).toBe(true);
  });

  it("writes one atomic snapshot cache file with both data sets", async () => {
    await load();
    const path = join(cacheDirPath, SNAPSHOT_NAME);
    expect(existsSync(path)).toBe(true);
    const cached = JSON.parse(readFileSync(path, "utf8")) as { revision: string; packs: unknown[] };
    expect(cached.revision).toBe(SHA);
    expect(cached.packs).toHaveLength(2);
    // The tmp file is renamed into place: the snapshot is the only file left.
    expect(readdirSync(cacheDirPath)).toEqual([SNAPSHOT_NAME]);
  });

  it("accepts unknown extra fields in both files", async () => {
    const skills = defaultSkills().map((skill) => ({ ...skill, future_field: "keep me" }));
    const result = await load({
      indexBody: indexFile(skills, { generated_at: "2026-09-20T00:00:00Z" }),
      packBody: packFile(PACKS, { generated_at: "2026-09-20T00:00:00Z" }),
    });
    expect(result.snapshot.skills).toHaveLength(4);
  });

  it("accepts S-series names with underscores and uppercase segments", async () => {
    const result = await load();
    const found = result.snapshot.skills.find((skill) => skill.name === S_SERIES_SKILL.name);
    expect(found?.install_type).toBe("workspace");
  });

  it("rejects an unsupported schema_version as unsupported_schema", async () => {
    await expectSkillError(load({ indexBody: indexFile(defaultSkills(), { schema_version: 2 }) }), "unsupported_schema");
    await expectSkillError(load({ packBody: packFile(PACKS, { schema_version: 3 }) }), "unsupported_schema");
  });

  const invalidSkills: Array<[string, Partial<SkillRecord> & Record<string, unknown>]> = [
    ["empty name", { name: "" }],
    ["shell metacharacter in name", { name: "rdk;rm -rf" }],
    ["name with command substitution", { name: "rdk$(reboot)" }],
    ["name with backtick", { name: "rdk`reboot`" }],
    ["leading dash", { name: "-evil" }],
    ["name with newline", { name: "rdk\n--skill" }],
    ["empty description", { description: "" }],
    ["missing description", { description: undefined }],
    ["unknown install_type", { install_type: "hybrid" }],
    ["foreign repo owner", { repo: "Evil-Corp/rdk-device-skills" }],
    ["repo with traversal", { repo: "D-Robotics/../evil" }],
    ["absolute catalog_path", { catalog_path: "/etc/skills/evil" }],
    ["traversal catalog_path", { catalog_path: "skills/../../etc/evil" }],
    ["dot segment catalog_path", { catalog_path: "skills/./gpio" }],
    ["empty segment catalog_path", { catalog_path: "skills//gpio" }],
    ["backslash catalog_path", { catalog_path: "skills\\evil" }],
    ["percent-encoded traversal", { catalog_path: "skills/%2e%2e/evil" }],
    ["path outside skills/", { catalog_path: "docs/evil" }],
  ];

  for (const [label, patch] of invalidSkills) {
    it(`rejects skill records: ${label}`, async () => {
      const skills = defaultSkills().map((skill) =>
        skill === FLAT_SKILL ? { ...skill, ...patch } : skill,
      );
      await expectSkillError(load({ indexBody: indexFile(skills) }), "invalid_catalog");
    });
  }

  it("rejects duplicate skill names", async () => {
    const skills = [...defaultSkills(), { ...FLAT_SKILL }];
    await expectSkillError(load({ indexBody: indexFile(skills) }), "invalid_catalog");
  });

  it("rejects a workspace skill whose pack is missing from the registry (no flat downgrade)", async () => {
    const skills = defaultSkills().map((skill) =>
      skill === X5_WORKSPACE_SKILL ? { ...skill, pack: "OE Tool Chain (X6)" } : skill,
    );
    const error = await expectSkillError(load({ indexBody: indexFile(skills) }), "invalid_catalog");
    expect(error.message).toContain("OE Tool Chain (X6)");
  });

  it("rejects a workspace skill whose repo does not match its pack", async () => {
    const skills = defaultSkills().map((skill) =>
      skill === X5_WORKSPACE_SKILL ? { ...skill, repo: "D-Robotics/oe-skills-s" } : skill,
    );
    await expectSkillError(load({ indexBody: indexFile(skills) }), "invalid_catalog");
  });

  const invalidPacks: Array<[string, unknown[]]> = [
    ["duplicate pack name", [PACKS[0], { ...PACKS[0], repo: "D-Robotics/oe-skills-s-2" }, PACKS[1]]],
    ["absolute install_script", [{ ...PACKS[0], install_script: "/bin/sh" }, PACKS[1]]],
    ["traversal install_script", [{ ...PACKS[0], install_script: "../run.sh" }, PACKS[1]]],
    ["ref with traversal", [{ ...PACKS[0], ref: "refs/../../evil" }, PACKS[1]]],
    ["workspace_dir outside the allowed set", [{ ...PACKS[0], workspace_dir: ".ssh" }, PACKS[1]]],
    ["verify_paths traversal", [{ ...PACKS[0], verify_paths: ["../outside.txt"] }, PACKS[1]]],
    ["empty verify_paths", [{ ...PACKS[0], verify_paths: [] }, PACKS[1]]],
    ["flat install_type on a pack", [{ ...PACKS[0], install_type: "flat" }, PACKS[1]]],
  ];

  for (const [label, packs] of invalidPacks) {
    it(`rejects pack records: ${label}`, async () => {
      await expectSkillError(load({ packBody: packFile(packs) }), "invalid_catalog");
    });
  }

  it("rejects a pack repo registered twice under different names", async () => {
    const clone = { ...PACKS[0], name: "OE Tool Chain (S) again" };
    await expectSkillError(load({ packBody: packFile([PACKS[0], clone, PACKS[1]]) }), "invalid_catalog");
  });

  it("maps HTTP failures to catalog_unavailable with clear messages", async () => {
    const rateLimit = await expectSkillError(load({ revisionStatus: 403 }), "catalog_unavailable");
    expect(rateLimit.message).toContain("rate limit");
    await expectSkillError(load({ revisionStatus: 429 }), "catalog_unavailable");
    const missing = await expectSkillError(load({ indexStatus: 404 }), "catalog_unavailable");
    expect(missing.message).toContain("404");
    await expectSkillError(load({ packStatus: 500 }), "catalog_unavailable");
  });

  it("maps network errors from the transport to catalog_unavailable", async () => {
    const failing: CatalogHttp = async () => {
      throw new Error("ECONNRESET");
    };
    await expectSkillError(loadSkillCatalog({ httpGet: failing, now: () => nowMs }), "catalog_unavailable");
  });

  it("enforces the 5 MiB per-file size limit", async () => {
    const huge = JSON.stringify({ schema_version: 1, skills: defaultSkills() }) + " ".repeat(MAX_JSON_BYTES_FOR_TESTS);
    const error = await expectSkillError(load({ indexBody: huge }), "catalog_unavailable");
    expect(error.message).toContain("byte catalog limit");
  });

  it("rejects malformed JSON as invalid_catalog", async () => {
      await expectSkillError(load({ indexBody: '{"schema_version":1,"skills":[oops' }), "invalid_catalog");
  });

  it("rejects a revision response without a valid sha", async () => {
    await expectSkillError(load({ revisionBody: JSON.stringify({ sha: "not-a-sha" }) }), "invalid_catalog");
    await expectSkillError(load({ revisionBody: "internal server error" }), "invalid_catalog");
  });

  it("does not write any cache when one of the two downloads fails", async () => {
    await expectSkillError(load({ packStatus: 500 }), "catalog_unavailable");
    expect(existsSync(join(cacheDirPath, SNAPSHOT_NAME))).toBe(false);
  });

  it("does not replace an existing snapshot when the refresh fails", async () => {
    await load();
    const path = join(cacheDirPath, SNAPSHOT_NAME);
    const before = readFileSync(path, "utf8");
    resetSkillCatalogState();
    nowMs += 24 * 60 * 60 * 1000 + 1; // expire the disk snapshot so a refresh runs
    await expectSkillError(load({ indexStatus: 500 }), "catalog_unavailable");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("builds source and usage URLs from the snapshot revision", async () => {
    const { snapshot } = await load();
    expect(skillSourceUrl(snapshot, "skills/rdk-gpio-40pin")).toBe(
      `https://github.com/D-Robotics/rdk-skills/blob/${SHA}/skills/rdk-gpio-40pin/SKILL.md`,
    );
    expect(hubUsageUrl(snapshot)).toBe(
      `https://github.com/D-Robotics/rdk-skills/blob/${SHA}/docs/SKILL-USAGE.md`,
    );
  });
});

describe("pack board families (retest 2026-09-21)", () => {
  it("resolves the two known packs from the sourced name table", () => {
    expect(packBoardFamilies({ name: "OE Tool Chain (X5)", workspace_dir: ".drobotics", catalog_dir: "oe-skills-x5" })).toEqual(["x5"]);
    expect(packBoardFamilies({ name: "OE Tool Chain (S)", workspace_dir: ".horizon", catalog_dir: "oe-skills-s" })).toEqual(["s100", "s600"]);
    expect(defaultPackBoardFamilies("OE Tool Chain (S)")).toEqual(["s100", "s600"]);
  });

  it("derives families from workspace_dir metadata for unknown pack names", () => {
    expect(packBoardFamilies({ name: "Future X5 Pack", workspace_dir: ".drobotics", catalog_dir: "future-x5" })).toEqual(["x5"]);
    expect(packBoardFamilies({ name: "Future S Pack", workspace_dir: ".horizon", catalog_dir: "future-s" })).toEqual(["s100", "s600"]);
  });

  it("falls back to board words in catalog_dir, and never guesses from bare letters", () => {
    expect(packBoardFamilies({ name: "Some Pack", workspace_dir: ".custom", catalog_dir: "oe-skills-x3" })).toEqual(["x3"]);
    // "S" alone or a j6 chip name is not board evidence.
    expect(packBoardFamilies({ name: "OE Tool Chain", workspace_dir: ".custom", catalog_dir: "oe-skills-s" })).toBeUndefined();
    expect(packBoardFamilies({ name: "j6 helpers", catalog_dir: "j6-only" })).toBeUndefined();
  });

  it("indexes only resolvable packs from a snapshot's pack records", () => {
    const index = packBoardFamilyIndex([
      ...PACKS,
      { name: "Future Pack", repo: "D-Robotics/future-skills", ref: "v1", catalog_dir: "future", install_script: "setup.sh", workspace_dir: ".custom" },
    ]);
    expect(index.get("OE Tool Chain (X5)")).toEqual(["x5"]);
    expect(index.get("OE Tool Chain (S)")).toEqual(["s100", "s600"]);
    expect(index.get("Future Pack")).toBeUndefined();
  });
});

describe("skill catalog: snapshot cache", () => {
  let cacheDirPath: string;
  let savedCacheDir: string | undefined;
  let savedTtl: string | undefined;
  let nowMs: number;

  beforeEach(() => {
    resetSkillCatalogState();
    cacheDirPath = mkdtempSync(join(tmpdir(), "rdk-skill-catalog-"));
    savedCacheDir = process.env.RDK_DOCS_CACHE_DIR;
    savedTtl = process.env.RDK_DOCS_CACHE_TTL_MS;
    process.env.RDK_DOCS_CACHE_DIR = cacheDirPath;
    delete process.env.RDK_DOCS_CACHE_TTL_MS;
    nowMs = 1_700_000_000_000;
  });

  afterEach(() => {
    resetSkillCatalogState();
    rmSync(cacheDirPath, { recursive: true, force: true });
    if (savedCacheDir === undefined) delete process.env.RDK_DOCS_CACHE_DIR;
    else process.env.RDK_DOCS_CACHE_DIR = savedCacheDir;
    if (savedTtl === undefined) delete process.env.RDK_DOCS_CACHE_TTL_MS;
    else process.env.RDK_DOCS_CACHE_TTL_MS = savedTtl;
  });

  const load = (routes: FakeRoutes = {}, log: string[] = []) =>
    loadSkillCatalog({ httpGet: fakeHttp(routes, log), now: () => nowMs });

  it("serves repeated loads from memory, then from disk after a process restart", async () => {
    const log: string[] = [];
    await load({}, log);
    expect(log).toHaveLength(3);

    await load({}, log);
    expect(log).toHaveLength(3); // in-process memory hit, no new fetches

    resetSkillCatalogState();
    const fromDisk = await load({}, log);
    expect(log).toHaveLength(3); // disk cache hit, still no new fetches
    expect(fromDisk.from_cache).toBe(true);
    expect(fromDisk.snapshot.revision).toBe(SHA);
  });

  it("refetches after the TTL expires", async () => {
    const log: string[] = [];
    await load({}, log);
    resetSkillCatalogState();
    nowMs += 24 * 60 * 60 * 1000 + 1; // past the default 24h TTL
    const refreshed = await load({}, log);
    expect(log).toHaveLength(6);
    expect(refreshed.from_cache).toBe(false);
    expect(refreshed.snapshot.fetched_at).toBe(new Date(nowMs).toISOString());
  });

  it("refetches on every load when RDK_DOCS_CACHE_TTL_MS=0", async () => {
    process.env.RDK_DOCS_CACHE_TTL_MS = "0";
    const log: string[] = [];
    await load({}, log);
    await load({}, log);
    expect(log).toHaveLength(6);
  });

  it("treats a corrupt cache file as a miss and refetches", async () => {
    await load();
    writeFileSync(join(cacheDirPath, SNAPSHOT_NAME), "{not json", "utf8");
    resetSkillCatalogState();
    const log: string[] = [];
    const result = await load({}, log);
    expect(log).toHaveLength(3);
    expect(result.from_cache).toBe(false);
  });

  it("treats a structurally invalid cache file as a miss and refetches", async () => {
    await load();
    // A workspace skill whose pack is missing fails cross-validation, so the
    // cache content is rejected wholesale instead of being served partly.
    const orphan = { ...X5_WORKSPACE_SKILL, pack: "OE Tool Chain (X6)" };
    const tampered = JSON.stringify({
      schema: 1,
      revision: SHA,
      fetched_at: new Date(nowMs).toISOString(),
      skills: [orphan],
      packs: PACKS,
    });
    writeFileSync(join(cacheDirPath, SNAPSHOT_NAME), tampered, "utf8");
    resetSkillCatalogState();
    const result = await load();
    expect(result.snapshot.skills).toHaveLength(4); // refetched, not the tampered cache
  });

  it("fails the load when an expired refresh fails, without touching the old cache", async () => {
    await load();
    const path = join(cacheDirPath, SNAPSHOT_NAME);
    const before = readFileSync(path, "utf8");
    resetSkillCatalogState();
    nowMs += 24 * 60 * 60 * 1000 + 1;
    await expectSkillError(load({ revisionStatus: 503 }), "catalog_unavailable");
    expect(readFileSync(path, "utf8")).toBe(before);
    // The catalog recovers once the hub is reachable again.
    const recovered = await load();
    expect(recovered.snapshot.revision).toBe(SHA);
  });

  it("shares one refresh between concurrent loads in the same process", async () => {
    const log: string[] = [];
    const [a, b] = await Promise.all([load({}, log), load({}, log)]);
    expect(log.filter((url) => url.includes("commits/HEAD"))).toHaveLength(1);
    expect(a.snapshot.revision).toBe(b.snapshot.revision);
  });

  it("returns a cache_write_failed warning but still serves the validated snapshot", async () => {
    const blocker = join(cacheDirPath, "blocker");
    writeFileSync(blocker, "not a directory", "utf8");
    process.env.RDK_DOCS_CACHE_DIR = join(blocker, "nested");
    const log: string[] = [];
    const result = await load({}, log);
    expect(log).toHaveLength(3);
    expect(result.from_cache).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("cache_write_failed");
    expect(result.snapshot.revision).toBe(SHA);

    // The in-memory snapshot stays usable with the same warning.
    const again = await load({}, log);
    expect(again.from_cache).toBe(true);
    expect(again.warnings).toEqual(result.warnings);
  });
});
