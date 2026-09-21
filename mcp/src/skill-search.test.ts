import { describe, expect, it } from "vitest";
import type { SkillRecord } from "./skill-catalog.js";
import { searchSkillRecords } from "./skill-search.js";

/**
 * Fixtures mirror real rdk-skills catalog records (revision 08d0a46) so the
 * ranking rules are validated against actual upstream wording, including the
 * negative-description traps called out in issue #4 §8.
 */
const SKILLS: SkillRecord[] = [
  {
    name: "rdk-gpio-40pin",
    description:
      "Use the 40PIN interface on D-Robotics RDK devices with the preinstalled Hobot.GPIO Python library, covering GPIO, I2C, SPI, UART, and PWM wiring and first-run samples. Use when the user wants to light an LED, read a sensor, use serial/I2C/SPI/PWM on the 40PIN header, or asks about pin definitions and voltage levels. Triggers include 点亮 LED, 点灯, GPIO, 40PIN, 引脚定义, 串口, UART, I2C 传感器, PWM, Hobot.GPIO, 3.3V. Do not use for MIPI camera hookup (rdk-camera-setup) or kernel driver development.",
    pack: "RDK Device Skills",
    repo: "D-Robotics/rdk-device-skills",
    catalog_path: "skills/rdk-gpio-40pin",
    install_type: "flat",
  },
  {
    name: "rdk-hardware",
    description:
      "Hardware facts for RDK boards: six-board specs (X3/X5/Ultra/S100/S100P/S600), 40PIN/GPIO and I2C/SPI/UART/PWM, power/LEDs, display, network/IP, CAN, TOPS/RAM, cooling, OS lines, and system paths. Use for board-specific pinouts, interfaces, voltage, credentials, model directories, IP, capacity, or hardware comparisons. 触发词:各板引脚一样吗、40PIN怎么接、IO电平、默认用户名密码、模型目录在哪、CAN口、网口默认IP、算力多少TOPS、BPU算力、TOPS对比、X3算力、X5算力、内存多大、供电几V、HDMI分辨率、TROS路径、板型怎么查。Routing — workspace-router handoffs are availability-gated (missing → install the matching OE workspace Pack with rdk-pack-installer, restart, retry); error-code/boot failure → rdk-board-knowledge; peripheral control → rdk-peripheral-cookbook; on-board inference → rdk-model-deploy; own-model conversion: X5 → x5-router, S-series → horizon-router, X3/Ultra → rdk-docs-reference for official toolchain docs; camera bringup → rdk-camera-setup; board selection → rdk-ecosystem.",
    pack: "RDK Device Skills",
    repo: "D-Robotics/rdk-device-skills",
    catalog_path: "skills/rdk-hardware",
    install_type: "flat",
  },
  {
    name: "rdk-model-deploy",
    description:
      "Deploy quantized models on D-Robotics RDK devices (.bin for X series, .hbm for S series) via RDK Model Zoo samples, pydev_demo Python APIs, and hrt_model_exec validation. Use when the user wants to run YOLO, classification, segmentation or any model on RDK, asks where to start, or hits model load failures. Triggers include 部署模型, 跑模型, 模型加载失败, dnn_node 报错, Model Zoo, hobot_dnn, bin 模型, hbm 模型. Do not use for model conversion/quantization (hb_mapper, dev machine) or performance benchmarking (rdk-model-benchmark).",
    pack: "RDK Device Skills",
    repo: "D-Robotics/rdk-device-skills",
    catalog_path: "skills/rdk-model-deploy",
    install_type: "flat",
  },
  {
    name: "rdk-skill-finder",
    description:
      'Find the real D-Robotics RDK Skill or workspace pack for a task, board platform, or installation type, then return its deterministic install or handoff action. Use for requests such as "which skill handles X5 model quantization?", "find an RDK skill for diagnostics", "what RDK toolchain pack should I use?", or "帮我找 X5 模型量化/编译对应的 Skill". Do not use to install or modify anything directly; use rdk-pack-installer for confirmed workspace-pack installation.',
    pack: "D-Robotics Skills",
    repo: "D-Robotics/rdk-skills",
    catalog_path: "skills/rdk-skill-finder",
    install_type: "flat",
  },
  {
    name: "bsp-kernel-build",
    description:
      "Build RDK Linux kernel, device-tree, and driver-module artifacts with mk_kernel.sh (X5 also offers mk_kernel_rt.sh). Require board family, target, config source, and deployment target; confirm boot replacement or reboot. Use for kernel/DTB/module/RT work, not full images (bsp-image-build), deb packaging (bsp-deb-build), or S-series (bsp-s-series).",
    pack: "BSP Skills",
    repo: "D-Robotics/bsp-skills",
    catalog_path: "skills/bsp-kernel-build",
    install_type: "flat",
  },
  {
    name: "x5-router",
    description:
      "路由 X5 环境、OE Mapper PTQ、Plugin QAT、Runtime、板端 Python 和诊断请求；当目标芯片明确为 X5 或请求包含 bayes-e、hb_mapper、X5 .bin、March.BAYES_E 时使用。只选择一个主 Skill 并生成 route.json；不执行 HAT、X3 或 S 系列工作流。",
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
    name: "x5-ptq-config-authoring",
    description:
      "生成并机器校验 X5 OE Mapper PTQ YAML；当模型预检通过、输入和校准合同已明确，需要得到 march=bayes-e 的可审阅配置时使用。拒绝 Plugin load/QAT 混用、HAT 和 S 系列字段。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-ptq-config-authoring",
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
    name: "x5-qat-training",
    description:
      "执行 X5 Plugin calibration、量化感知训练、validation 和 convert 后定点评测；当适配模型已可运行，需要生成可比较指标与检查点时使用。要求 March.BAYES_E 和可复现训练，不使用 HAT Trainer。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-qat-training",
    install_type: "workspace",
  },
  {
    name: "x5-runtime-deploy",
    description:
      "编排 X5 Runtime 模型门禁、板端上传、命令行/C++ 推理、正确性、性能与资源验证；当用户要上板运行 X5 .bin、使用 hrt_model_exec 或 BPU SDK 时使用。Plugin .hbm/.hbir 只有在实际 Runtime 兼容证据充分时才接收；不使用 S 系列 UCP。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-runtime-deploy",
    install_type: "workspace",
  },
  {
    name: "x5-ptq-compile",
    description:
      "执行已验证 X5 YAML 的 hb_mapper checker/makertbin 并验证唯一 .bin 与 BPU march；当配置和环境已就绪、需要生成 bayes-e PTQ 产物时使用。不得处理 QAT .hbm/.hbir，也不得复用非空输出目录而未确认。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-ptq-compile",
    install_type: "workspace",
  },
  {
    name: "x5-accuracy-diagnostics",
    description:
      "定位 X5 PTQ 或 Plugin QAT 的首次精度掉点阶段；当有浮点、校准、QAT、定点、编译或板端指标及固定输入时使用。只读比较并设计单变量实验，不自动重训或重编译。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-accuracy-diagnostics",
    install_type: "workspace",
  },
  {
    name: "x5-board-monitor",
    description:
      "采集并解析 X5 hrut_somstatus、温度、CPU/BPU/DDR/GPU 频率、BPU ratio 和 dmesg 证据；当需要建立板端资源快照或关联性能异常时使用。默认只读和有界采样，不调频、不清日志、不循环到手工终止。",
    pack: "OE Tool Chain (X5)",
    repo: "D-Robotics/oe-skills-x5",
    catalog_path: "skills/oe-skills-x5/skills/x5-board-monitor",
    install_type: "workspace",
  },
  {
    name: "horizon-router",
    description:
      "OpenExplorer 工具链入口 Skill，处理 PTQ/QAT 量化编译、板端部署、性能精度评估等请求，并将任务路由到对应的 Horizon 子 Skill。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/horizon-router",
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
    name: "rdk-model-zoo-develop",
    description:
      "Use when adding or modifying maintained RDK Model Zoo samples, shared utilities, sample docs, tests, or repository conventions, including bug fixes. 触发词：开发样例、新增模型、修复 sample、公共工具。Do not use as the primary skill for read-only review, ready-made use, or toolchain quantization.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-develop",
    install_type: "flat",
  },
  {
    name: "rdk-model-zoo-integrate",
    description:
      "Use when integrating a custom model artifact or changed I/O contract into an RDK Model Zoo sample, including class-count, shape, wrapper, or cross-platform adaptation. 触发词：自训练接入、替换权重、接口适配。Do not use to implement PTQ/QAT or to review an unchanged sample.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-integrate",
    install_type: "flat",
  },
  {
    name: "rdk-model-zoo-release",
    description:
      "Use when preparing or checking RDK Model Zoo model releases, Skills Pack releases, manifests, Hub registration migration, tags, or release isolation. 触发词：模型发版、Skills 发版、Hub 接入、Tag 兼容。Do not use for routine sample development, OE Pack releases, or publishing without explicit authorization.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-release",
    install_type: "flat",
  },
  {
    name: "rdk-model-zoo-repo",
    description:
      "Use to establish an RDK Model Zoo checkout's platform, version, layout, conventions, dirty or untracked files, affected samples, and development entrypoints. 触发词：仓库上下文、工作区盘点、开发入口、分支规范。Workspace inventory belongs here; assessing code correctness, standards compliance or delivery readiness belongs to review. Do not use as primary for ready-made model lookup or quantization.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-repo",
    install_type: "flat",
  },
  {
    name: "rdk-model-zoo-review",
    description:
      "Use to assess an RDK Model Zoo sample, PR, local changes, staged diff, or commit range for standards compliance, delivery completeness, technical correctness, and regressions. 触发词：PR review、样例审计、代码评审。Platform, version, directory or untracked-file inventory without a quality assessment belongs to rdk-model-zoo-repo. Do not use to modify code, run quantization, or silently execute board tests.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-review",
    install_type: "flat",
  },
  {
    name: "rdk-model-zoo-validate",
    description:
      "Use when planning or executing sample-scoped RDK Model Zoo smoke, numerical, accuracy, performance, or regression checks and preparing verification evidence. 触发词：样例验收、回归测试、数值一致性。Do not use as a PR verdict, a published-benchmark lookup, or a quantization implementation.",
    pack: "RDK Model Zoo Skills",
    repo: "D-Robotics/rdk_model_zoo",
    catalog_path: "skills/rdk-model-zoo-validate",
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
  {
    name: "__SKILL_j6-plugin-__quantization",
    description:
      "为基础网络结构生成量化流程代码（set_march → 插入 Quant/DeQuant → 配置量化参数 → prepare → 校准 → QAT 训练）。务必在用户提到模型量化、量化流程、QAT 校准、Horizon 量化适配、HistogramObserver/MinMaxObserver 配置、量化参数配置、校准训练、QuantStub 插入时触发此 skill，即使用户只问其中一个步骤，只要涉及 Horizon 量化流程的任何环节都应触发。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/plugin/j6-plugin-hbdk-generating/j6-plugin-quantization",
    install_type: "workspace",
  },
  {
    name: "j6-board-monitor",
    description:
      "RDK S 系列开发板资源监控与推理期间资源采集。当用户需要监控 BPU 占用率、DDR 带宽、内存使用时触发。支持三种场景：CV 模型推理期间同步采集 BPU/DDR/内存数据、独立监控板端硬件资源、LLM 模型循环推理期间同步采集资源数据。关键词：BPU 监控、DDR 带宽、内存使用、资源监控、板端资源评估。注意：不要用 hbm_infer/gRPC 做高频推理监控。",
    pack: "OE Tool Chain (S)",
    repo: "D-Robotics/oe-skills-s",
    catalog_path: "skills/oe-skills-s/skills/ucp/j6-board-monitor",
    install_type: "workspace",
  },
];

const names = (result: { matches: Array<{ skill: SkillRecord }> }) => result.matches.map((m) => m.skill.name);

describe("skill search ranking", () => {
  it("ranks an exact name query first", () => {
    const result = searchSkillRecords(SKILLS, "rdk-gpio-40pin");
    expect(result.matches[0]?.skill.name).toBe("rdk-gpio-40pin");
    expect(result.matches[0]?.match_reason).toContain("exact");
  });

  it("keeps 'X5 40PIN GPIO' on GPIO and away from model-only precision diagnostics", () => {
    const result = searchSkillRecords(SKILLS, "X5 40PIN GPIO");
    expect(result.matches[0]?.skill.name).toBe("rdk-gpio-40pin");
    expect(names(result)).not.toContain("x5-accuracy-diagnostics");
    expect(names(result)).not.toContain("x5-board-monitor");
    expect(names(result)).not.toContain("bsp-kernel-build");
  });

  it("ranks the PTQ orchestrator first for an explicit PTQ deploy query", () => {
    const result = searchSkillRecords(SKILLS, "X5 PTQ 量化部署");
    expect(result.matches[0]?.skill.name).toBe("x5-ptq-deploy");
    expect(result.matches[0]?.skill.install_type).toBe("workspace");
    expect(result.guidance_kind).not.toBe("ambiguous_quant");
  });

  it("ranks the QAT entry first when QAT is explicit", () => {
    const result = searchSkillRecords(SKILLS, "X5 QAT");
    expect(result.matches[0]?.skill.name).toBe("x5-qat-deploy");
  });

  it("does not let a negated QAT mention outrank positive QAT entries", () => {
    // x5-ptq-config-authoring only mentions QAT inside a 拒绝… clause.
    const result = searchSkillRecords(SKILLS, "X5 QAT");
    expect(names(result)).not.toContain("x5-ptq-config-authoring");
    // rdk-model-deploy mentions quantization only in a "Do not use for" clause,
    // while its positive deploy trigger words must still rank it first.
    const deploy = searchSkillRecords(SKILLS, "部署模型到板端跑起来");
    expect(deploy.matches[0]?.skill.name).toBe("rdk-model-deploy");
  });

  it("asks for PTQ/QAT disambiguation instead of deciding for an ambiguous quantization query", () => {
    const result = searchSkillRecords(SKILLS, "X5 模型量化");
    expect(result.guidance_kind).toBe("ambiguous_quant");
    expect(result.guidance).toContain("PTQ");
    expect(result.guidance).toContain("QAT");
    // Atomic sub-steps must not be presented as the decided answer.
    expect(names(result)).not.toContain("x5-qat-training");
    expect(names(result)).not.toContain("x5-qat-deploy");
    expect(names(result)).not.toContain("x5-ptq-config-authoring");
    expect(names(result)).not.toContain("rdk-model-deploy");
    expect(names(result)).not.toContain("rdk-skill-finder");
    // The router entry from the validated catalog is allowed.
    expect(names(result)).toContain("x5-router");
    expect(result.matches[0]?.skill.name).toBe("x5-router");
  });

  it("returns candidates with a refine-guidance for a model-only query", () => {
    const result = searchSkillRecords(SKILLS, "X5");
    expect(result.guidance_kind).toBe("model_only");
    expect(result.guidance).toContain("task");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.length).toBeLessThan(10);
  });

  it("returns an empty match list for unrelated queries", () => {
    const result = searchSkillRecords(SKILLS, "量子纠缠曲奇怎么做");
    expect(result.matches).toEqual([]);
    expect(result.guidance_kind).toBe("no_match");
  });

  it("filters by install_type, pack, and platform text", () => {
    const flat = searchSkillRecords(SKILLS, "40PIN GPIO", { installType: "flat" });
    expect(names(flat)).toContain("rdk-gpio-40pin");
    expect(flat.matches.every((m) => m.skill.install_type === "flat")).toBe(true);
    expect(names(flat)).not.toContain("x5-router");

    const oe = searchSkillRecords(SKILLS, "router", { pack: "OE Tool Chain (X5)" });
    expect(oe.matches.map((m) => m.skill.name)).toEqual(["x5-router"]);

    // A platform filter drops skills scoped to another board but keeps
    // board-agnostic ones like rdk-gpio-40pin.
    const x5 = searchSkillRecords(SKILLS, "40PIN GPIO", { platform: "x5" });
    expect(names(x5)).toContain("rdk-gpio-40pin");
    expect(names(x5)).not.toContain("horizon-router");
  });

  it("applies the limit after ranking", () => {
    const result = searchSkillRecords(SKILLS, "X5", { limit: 3 });
    expect(result.matches).toHaveLength(3);
  });

  it("reports matched terms and a reason for every match", () => {
    const result = searchSkillRecords(SKILLS, "X5 40PIN GPIO");
    for (const match of result.matches) {
      expect(match.matched_terms.length).toBeGreaterThan(0);
      expect(match.match_reason.length).toBeGreaterThan(0);
    }
    const top = result.matches[0];
    expect(top.matched_terms).toEqual(expect.arrayContaining(["gpio", "40pin"]));
  });

  it("matches Chinese natural-language queries against Chinese descriptions", () => {
    const result = searchSkillRecords(SKILLS, "训练感知量化");
    expect(names(result)).toContain("x5-qat-training");
  });
});

describe("skill search ranking — retest 2026-09-21", () => {
  it("keeps mutually exclusive QAT flows out of an explicit PTQ query (whole result set)", () => {
    const result = searchSkillRecords(SKILLS, "X5 PTQ 量化部署", { limit: 5 });
    const all = names(result);
    // QAT-dedicated workflows are a different, mutually exclusive path.
    expect(all).not.toContain("x5-qat-deploy");
    expect(all).not.toContain("x5-qat-training");
    // PTQ flow plus generic deploy/runtime/compile helpers stay available.
    expect(all).toContain("x5-ptq-deploy");
    expect(all).toContain("rdk-model-deploy");
    expect(all).toContain("x5-runtime-deploy");
    expect(all).toContain("x5-ptq-compile");
    expect(result.matches[0]?.skill.name).toBe("x5-ptq-deploy");
  });

  it("keeps mutually exclusive PTQ flows out of an explicit QAT query (whole result set)", () => {
    const result = searchSkillRecords(SKILLS, "X5 QAT 量化部署", { limit: 5 });
    const all = names(result);
    expect(all).not.toContain("x5-ptq-deploy");
    expect(all).not.toContain("x5-ptq-compile");
    expect(all).toContain("x5-qat-deploy");
    expect(all).toContain("rdk-model-deploy");
    expect(result.matches[0]?.skill.name).toBe("x5-qat-deploy");
  });

  it("does not exclude either path for a PTQ-vs-QAT comparison question", () => {
    const result = searchSkillRecords(SKILLS, "PTQ 和 QAT 有什么区别");
    const all = names(result);
    expect(all).toContain("x5-ptq-deploy");
    expect(all).toContain("x5-qat-deploy");
    expect(result.guidance_kind).not.toBe("ambiguous_quant");
  });

  it("honors a negated QAT mention: 不用 QAT 直接 PTQ 量化 keeps the PTQ path", () => {
    const result = searchSkillRecords(SKILLS, "不用 QAT，直接 PTQ 量化部署");
    const all = names(result);
    expect(all).not.toContain("x5-qat-deploy");
    expect(all).not.toContain("x5-qat-training");
    expect(all).toContain("x5-ptq-deploy");
  });

  it("honors a negated PTQ mention: not PTQ, QAT 部署 keeps the QAT path", () => {
    const result = searchSkillRecords(SKILLS, "not PTQ: X5 QAT 量化部署");
    const all = names(result);
    expect(all).not.toContain("x5-ptq-deploy");
    expect(all).toContain("x5-qat-deploy");
  });

  it("returns invalid_input for a query with zero usable tokens", () => {
    const result = searchSkillRecords(SKILLS, "!!!");
    expect(result.matches).toEqual([]);
    expect(result.guidance_kind).toBe("invalid_input");
    expect(result.guidance).toMatch(/no usable search terms/i);
  });

  it("returns invalid_input for digit-only and stopword-only queries", () => {
    for (const query of ["12345", "怎么样？", "？？？吗呢啊"]) {
      const result = searchSkillRecords(SKILLS, query);
      expect(result.matches).toEqual([]);
      expect(result.guidance_kind).toBe("invalid_input");
    }
  });

  it("requires a real model hit for model-only queries — orchestrator bonus alone never qualifies", () => {
    // J6 exists in the fixture only inside the S-series pack records; a J6-only
    // query returns exactly those records, never deploy-named entries riding
    // on the orchestrator bonus.
    const j6 = searchSkillRecords(SKILLS, "J6");
    expect(j6.guidance_kind).toBe("model_only");
    expect(j6.matches.length).toBeGreaterThan(0);
    for (const match of j6.matches) {
      expect(match.matched_terms).toContain("j6");
    }
    expect(names(j6)).not.toContain("x5-ptq-deploy");

    // A model that does exist returns only records that actually match it.
    const x5 = searchSkillRecords(SKILLS, "X5");
    expect(x5.guidance_kind).toBe("model_only");
    expect(x5.matches.length).toBeGreaterThan(0);
    for (const match of x5.matches) {
      expect(match.matched_terms).toContain("x5");
    }
  });
});

describe("skill search ranking — natural language quality (retest 2026-09-21)", () => {
  const readyQueries = [
    "现成的量化好的模型直接用",
    "官方已经量化好的模型",
    "找模型库",
    "找预训练模型",
    "pretrained models ready to use",
  ];

  it.each(readyQueries)("routes a ready-model ask to the Model Zoo user entry: %s", (query) => {
    const result = searchSkillRecords(SKILLS, query);
    expect(result.matches[0]?.skill.name).toBe("rdk-model-zoo");
    expect(result.guidance_kind).not.toBe("ambiguous_quant");
  });

  const undecidedQueries = ["我想量化模型", "X5 上把模型量化后部署", "量化", "quantization"];

  it.each(undecidedQueries)("keeps PTQ/QAT guidance undecided for: %s", (query) => {
    const result = searchSkillRecords(SKILLS, query);
    expect(result.guidance_kind).toBe("ambiguous_quant");
    // No PTQ/QAT-dedicated workflow may be presented as the decided answer,
    // even when the query returned no candidates at all.
    for (const match of result.matches) {
      expect(/(^|[-_])(ptq|qat)([-_]|$)/.test(match.skill.name.toLowerCase())).toBe(false);
    }
  });

  it("does not route the Model Zoo when the user negates ready-made models", () => {
    const result = searchSkillRecords(SKILLS, "不要现成模型，我要自己量化");
    expect(result.guidance_kind).toBe("ambiguous_quant");
    expect(names(result)).not.toContain("rdk-model-zoo");
  });

  it("does not treat 预训练 (pretrained) as a QAT training decision", () => {
    const result = searchSkillRecords(SKILLS, "找预训练模型");
    expect(result.guidance_kind).not.toBe("ambiguous_quant");
    // The word 训练 inside 预训练 must not promote a QAT-dedicated workflow
    // above the ready-model entry (or at all ahead of it).
    const ranked = names(result);
    expect(ranked.indexOf("rdk-model-zoo")).toBe(0);
    const qatAt = ranked.indexOf("x5-qat-training");
    expect(qatAt === -1 || qatAt > 0).toBe(true);
  });
});

describe("skill search ranking — platform scope and conflicts (retest 2026-09-21)", () => {
  const sPackNames = [
    "__SKILL_j6-plugin-__set-fake-quantize",
    "__SKILL_j6-plugin-__quantization",
    "j6-board-monitor",
    "horizon-router",
  ];

  it("excludes the known S-series pack when the query names X5", () => {
    const result = searchSkillRecords(SKILLS, "X5 上把模型量化后部署");
    const all = names(result);
    for (const name of sPackNames) expect(all).not.toContain(name);
    expect(all).toContain("x5-router");
    expect(result.matches[0]?.skill.name).toBe("x5-router");
  });

  it("excludes the known S-series pack when platform=x5 is explicit", () => {
    const result = searchSkillRecords(SKILLS, "量化模型 PTQ", { platform: "x5" });
    const all = names(result);
    for (const name of sPackNames) expect(all).not.toContain(name);
    expect(all).toContain("x5-ptq-deploy");
    expect(result.matches[0]?.skill.name).toBe("x5-ptq-deploy");
  });

  it("keeps board-agnostic GPIO and Model Zoo candidates under a board constraint", () => {
    const gpio = searchSkillRecords(SKILLS, "40PIN GPIO", { platform: "x5" });
    expect(names(gpio)).toContain("rdk-gpio-40pin");

    const zoo = searchSkillRecords(SKILLS, "X5 现成的量化好的模型直接用");
    expect(zoo.matches[0]?.skill.name).toBe("rdk-model-zoo");
    expect(zoo.guidance_kind).not.toBe("ambiguous_quant");
  });

  it("reports a platform conflict instead of silently recommending one board", () => {
    const result = searchSkillRecords(SKILLS, "X5 PTQ", { platform: "s100" });
    expect(result.matches).toEqual([]);
    expect(result.guidance_kind).toBe("platform_conflict");
    expect(result.guidance).toContain("X5");
    expect(result.guidance).toContain("S100");
  });

  it("does not narrow a multi-board comparison query to a single board", () => {
    const result = searchSkillRecords(SKILLS, "X5 和 S100 量化部署怎么选");
    const all = names(result);
    expect(all).toContain("x5-router");
    expect(all).toContain("horizon-router");

    // A single-board platform parameter on a comparison query must not
    // silently drop the other board either.
    const narrowed = searchSkillRecords(SKILLS, "X5 和 S100 量化部署怎么选", { platform: "x5" });
    expect(narrowed.guidance_kind).toBe("platform_conflict");
    expect(narrowed.matches).toEqual([]);
  });
});
