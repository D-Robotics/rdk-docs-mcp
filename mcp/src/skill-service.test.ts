import { describe, expect, it } from "vitest";
import { SkillError, type SkillCatalogSnapshot, type SkillRecord } from "./skill-catalog.js";
import { getSkillDetail, searchSkills, shellQuote, type SkillServiceDeps } from "./skill-service.js";

const SHA = "08d0a466413f11bbc045ba5e51f626bdb0346373";
const FETCHED_AT = "2026-09-20T08:00:00.000Z";

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
    name: "x5-ptq-deploy",
    description: "编排 ONNX/Caffe 到 X5 bayes-e .bin 的 OE Mapper PTQ 全流程；当用户要求 checker、校准、YAML、makertbin、模型信息和 Runtime 验证形成闭环时使用。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-ptq-deploy",
    install_type: "workspace",
  },
];

const PACKS = [
  {
    name: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    ref: "v1.0.0",
    catalog_dir: "oe-skills-x5",
    install_script: "setup.sh",
    workspace_dir: ".drobotics",
    verify_paths: [".drobotics/X5.md", ".drobotics/VERSION", ".drobotics/skills/x5-router/SKILL.md"],
  },
];

function snapshotWith(skills: SkillRecord[]): SkillCatalogSnapshot {
  return { schema: 1, revision: SHA, fetched_at: FETCHED_AT, skills, packs: PACKS };
}

function depsWith(snapshot: SkillCatalogSnapshot, warnings: string[] = []): SkillServiceDeps {
  return { loadCatalog: async () => ({ snapshot, warnings, from_cache: false }) };
}

const deps = depsWith(snapshotWith(SKILLS));

async function expectSkillError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SkillError);
    expect((error as SkillError).code).toBe(code);
    return;
  }
  throw new Error(`expected a SkillError with code ${code}, but the call resolved`);
}

describe("search_skills service", () => {
  it("returns matches with snapshot provenance and hub blob source URLs", async () => {
    const output = await searchSkills({ query: "X5 40PIN GPIO" }, deps);
    expect(output.matches[0]?.name).toBe("rdk-gpio-40pin");
    expect(output.matches[0]?.source_url).toBe(
      `https://github.com/D-Robotics/rdk-skills/blob/${SHA}/skills/rdk-gpio-40pin/SKILL.md`,
    );
    expect(output.catalog_revision).toBe(SHA);
    expect(output.fetched_at).toBe(FETCHED_AT);
    expect(output.warnings).toEqual([]);
    expect(output.guidance.length).toBeGreaterThan(0);
  });

  it("passes catalog warnings (e.g. cache_write_failed) through", async () => {
    const output = await searchSkills({ query: "GPIO" }, depsWith(snapshotWith(SKILLS), ["cache_write_failed: read-only"]));
    expect(output.warnings).toEqual(["cache_write_failed: read-only"]);
  });

  it("rejects invalid queries, limits, and install types", async () => {
    await expectSkillError(searchSkills({ query: "   " }, deps), "invalid_input");
    await expectSkillError(searchSkills({ query: "x".repeat(501) }, deps), "invalid_input");
    await expectSkillError(searchSkills({ query: "gpio", limit: 0 }, deps), "invalid_input");
    await expectSkillError(searchSkills({ query: "gpio", limit: 21 }, deps), "invalid_input");
    await expectSkillError(searchSkills({ query: "gpio", limit: 2.5 }, deps), "invalid_input");
    await expectSkillError(
      searchSkills({ query: "gpio", install_type: "hybrid" as never }, deps),
      "invalid_input",
    );
  });

  it("returns an empty match list for unrelated queries without erroring", async () => {
    const output = await searchSkills({ query: "量子纠缠曲奇" }, deps);
    expect(output.matches).toEqual([]);
    expect(output.guidance).toContain("No skill");
  });
});

describe("get_skill service", () => {
  it("returns the structured flat installation", async () => {
    const output = await getSkillDetail({ name: "rdk-gpio-40pin" }, deps);
    expect(output.installation).toEqual({
      type: "flat",
      command: "npx",
      args: ["skills", "add", "d-robotics/rdk-skills", "--skill", "rdk-gpio-40pin"],
      display_command: "npx skills add d-robotics/rdk-skills --skill rdk-gpio-40pin",
      requires_user_request: true,
      version_policy: "installer_default_not_catalog_pinned",
      docs_url: `https://github.com/D-Robotics/rdk-skills/blob/${SHA}/docs/SKILL-USAGE.md`,
      note: expect.stringContaining("whole directory"),
    });
    expect(output.source_url).toContain(`blob/${SHA}/skills/rdk-gpio-40pin/SKILL.md`);
  });

  it("returns the full workspace pack handoff, never a single-skill install", async () => {
    const output = await getSkillDetail({ name: "x5-ptq-deploy" }, deps);
    const installation = output.installation;
    if (installation.type !== "workspace") throw new Error(`expected workspace installation, got ${installation.type}`);
    expect(installation.handoff_skill).toBe("rdk-pack-installer");
    expect(installation.installer).toEqual({
      command: "npx",
      args: ["skills", "add", "d-robotics/rdk-skills", "--skill", "rdk-pack-installer"],
      display_command: "npx skills add d-robotics/rdk-skills --skill rdk-pack-installer",
    });
    expect(installation.pack).toEqual({
      name: "OE Tool Chain (X5)",
      repo: "D-Robotics/oe-skills-x5",
      ref: "v1.0.0",
      catalog_dir: "oe-skills-x5",
      install_script: "setup.sh",
      workspace_dir: ".drobotics",
      verify_paths: [".drobotics/X5.md", ".drobotics/VERSION", ".drobotics/skills/x5-router/SKILL.md"],
    });
    expect(installation.requires_project_root).toBe(true);
    expect(installation.requires_user_request).toBe(true);
    expect(JSON.stringify(installation)).not.toContain("--skill\",\"x5-ptq-deploy");
    expect(installation.note).toContain("catalog_revision");
    expect(installation.note).toContain("v1.0.0");
  });

  it("rejects unknown names without fuzzy matching", async () => {
    await expectSkillError(getSkillDetail({ name: "gpio-40pin" }, deps), "unknown_skill");
    await expectSkillError(getSkillDetail({ name: "  " }, deps), "invalid_input");
  });

  it("reports missing_installer when the handoff skill is absent from the snapshot", async () => {
    const withoutInstaller = snapshotWith(SKILLS.filter((skill) => skill.name !== "rdk-pack-installer"));
    await expectSkillError(getSkillDetail({ name: "x5-ptq-deploy" }, depsWith(withoutInstaller)), "missing_installer");
  });

  it("passes catalog warnings through", async () => {
    const output = await getSkillDetail({ name: "rdk-gpio-40pin" }, depsWith(snapshotWith(SKILLS), ["cache_write_failed: ro"]));
    expect(output.warnings).toEqual(["cache_write_failed: ro"]);
  });
});

describe("shellQuote", () => {
  it("leaves safe tokens unquoted and single-quotes the rest", () => {
    expect(shellQuote(["npx", "skills", "add", "d-robotics/rdk-skills", "--skill", "rdk-gpio-40pin"])).toBe(
      "npx skills add d-robotics/rdk-skills --skill rdk-gpio-40pin",
    );
    expect(shellQuote(["a b", "it's", ""])).toBe("'a b' 'it'\\''s' ''");
  });
});
