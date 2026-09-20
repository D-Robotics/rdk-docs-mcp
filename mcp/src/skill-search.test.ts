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
