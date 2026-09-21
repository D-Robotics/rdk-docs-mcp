import { describe, expect, it } from "vitest";
import { SkillError, type SkillCatalogSnapshot, type SkillRecord } from "./skill-catalog.js";
import { getSkillDetail, searchSkills, shellQuote, skillDisplayName, type SkillServiceDeps } from "./skill-service.js";

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
    name: "rdk-model-zoo",
    description:
      "Use when asking about ready-made RDK Model Zoo models, matching branches, downloads, sample execution, or published benchmarks. 触发词：现成模型、跑示例、模型目录、帧率查询。Do not use as the primary skill for PR review, repository development, custom quantization, or fresh performance measurement.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo",
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
    name: "__SKILL_j6-plugin-__set-fake-quantize",
    description:
      "在适配 horizon_plugin_pytorch 的量化流程中，为模型设置 fake quantize 状态（QAT/CALIBRATION/VALIDATION）。只添加/调用 set_fake_quantize，不做其他修改。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-set-fake-quantize",
    install_type: "workspace",
  },
  {
    name: "__SKILL_j6-plugin-__prepare",
    description:
      "在适配 horizon_plugin_pytorch 的过程中对浮点模型执行 prepare（仅添加 prepare 调用；qconfig_setter 固定为全部双 int8 模板；不包含 dynamic_block 相关修改）。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/plugin/j6-plugin-adaptation/j6-plugin-prepare",
    install_type: "workspace",
  },
  {
    // Synthetic counterpart for the display-name collision case only: a future
    // flat skill whose canonical name equals the cleaned display name above.
    name: "j6-plugin-prepare",
    description: "Hypothetical flat helper for j6 plugin prepare checks (synthetic collision fixture).",
    pack: "RDK Device Skills",
    repo: "D-Robotics/rdk-device-skills",
    catalog_path: "skills/j6-plugin-prepare",
    install_type: "flat",
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
  {
    name: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    ref: "v1.0.0",
    catalog_dir: "oe-skills-s",
    install_script: "setup.sh",
    workspace_dir: ".horizon",
    verify_paths: [".horizon/HORIZON.md", ".horizon/VERSION", ".horizon/skills/horizon-router/SKILL.md"],
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

  it("surfaces invalid_input for a query with zero usable tokens (retest 2026-09-21)", async () => {
    const output = await searchSkills({ query: "!!!" }, deps);
    expect(output.matches).toEqual([]);
    expect(output.guidance_kind).toBe("invalid_input");
    expect(output.guidance).toMatch(/no usable search terms/i);
  });

  it("keeps the mutually exclusive QAT flow out of an explicit PTQ query (retest 2026-09-21)", async () => {
    const output = await searchSkills({ query: "X5 PTQ 量化部署" }, deps);
    const all = output.matches.map((match) => match.name);
    expect(all).toContain("x5-ptq-deploy");
    expect(all).not.toContain("x5-qat-deploy");
  });

  it("excludes the S-series pack for a query naming X5 and for an explicit platform (retest 2026-09-21)", async () => {
    const byQuery = await searchSkills({ query: "X5 上把模型量化后部署" }, deps);
    expect(byQuery.matches.map((match) => match.name)).not.toContain("__SKILL_j6-plugin-__set-fake-quantize");

    const byPlatform = await searchSkills({ query: "量化模型 PTQ", platform: "x5" }, deps);
    const names = byPlatform.matches.map((match) => match.name);
    expect(names).not.toContain("__SKILL_j6-plugin-__set-fake-quantize");
    expect(names).not.toContain("__SKILL_j6-plugin-__prepare");
    expect(names[0]).toBe("x5-ptq-deploy");
  });

  it("returns platform_conflict with no candidates when the query and platform disagree", async () => {
    const output = await searchSkills({ query: "X5 PTQ", platform: "s100" }, deps);
    expect(output.matches).toEqual([]);
    expect(output.guidance_kind).toBe("platform_conflict");
    expect(output.guidance).toContain("X5");
    expect(output.guidance).toContain("S100");
  });

  it("routes a ready-model ask to the Model Zoo entry without PTQ/QAT disambiguation (retest 2026-09-21)", async () => {
    const output = await searchSkills({ query: "现成的量化好的模型直接用" }, deps);
    expect(output.matches[0]?.name).toBe("rdk-model-zoo");
    expect(output.guidance_kind).not.toBe("ambiguous_quant");
    expect(typeof output.matches[0]?.platform_scope).toBe("string");
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

describe("display names keep canonical identity (retest 2026-09-21)", () => {
  it("adds a display_name for generated __SKILL_ names while keeping name exact", async () => {
    const detail = await getSkillDetail({ name: "__SKILL_j6-plugin-__set-fake-quantize" }, deps);
    expect(detail.name).toBe("__SKILL_j6-plugin-__set-fake-quantize");
    expect(detail.display_name).toBe("j6-plugin-set-fake-quantize");
    // The workspace handoff keeps using the canonical name nowhere visible to
    // users directly, and the canonical name must remain the exact key.
    expect(detail.installation.type).toBe("workspace");

    // Searching by the exact canonical name keeps working and returns the
    // cleaned display name alongside.
    const search = await searchSkills({ query: "__SKILL_j6-plugin-__set-fake-quantize" }, deps);
    expect(search.matches[0]?.name).toBe("__SKILL_j6-plugin-__set-fake-quantize");
    expect(search.matches[0]?.display_name).toBe("j6-plugin-set-fake-quantize");
  });

  it("leaves names outside the generator format unchanged", async () => {
    const detail = await getSkillDetail({ name: "rdk-gpio-40pin" }, deps);
    expect(detail.display_name).toBe("rdk-gpio-40pin");
    expect(skillDisplayName("__SKILL_weird")).toBe("__SKILL_weird");
    expect(skillDisplayName("x5-ptq-deploy")).toBe("x5-ptq-deploy");
  });

  it("returns both records that share one display_name, each exactly gettable by canonical name", async () => {
    const search = await searchSkills({ query: "prepare" }, deps);
    const pair = search.matches.filter((match) => match.display_name === "j6-plugin-prepare");
    expect(pair.map((match) => match.name).sort()).toEqual(["__SKILL_j6-plugin-__prepare", "j6-plugin-prepare"]);

    const generated = await getSkillDetail({ name: "__SKILL_j6-plugin-__prepare" }, deps);
    expect(generated.display_name).toBe("j6-plugin-prepare");
    expect(generated.installation.type).toBe("workspace");

    const flat = await getSkillDetail({ name: "j6-plugin-prepare" }, deps);
    expect(flat.display_name).toBe("j6-plugin-prepare");
    expect(flat.installation.type).toBe("flat");
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
