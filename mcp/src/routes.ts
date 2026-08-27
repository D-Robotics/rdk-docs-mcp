import { resolveManual } from "./catalog.js";
import { isForumRef } from "./forum.js";
import { mentionedBoards, type BoardId } from "./products.js";
import type { SearchHit } from "./types.js";

export type OfficialPath = {
  id: string;
  title: string;
  url: string;
  manual: string;
  why: string;
  query: RegExp;
  manuals: string[];
  scope: "named-manual" | "product" | "global";
  product?: RegExp;
  boards?: BoardId[];
};

const ORIGIN = "https://developer.d-robotics.cc";

/** Spec questions only — must not steal USB-camera / how-to pins. */
const SPEC_QUERY =
  /硬件简介|接口总览|几路|多少路|供电电压|默认静态\s*ip|type-a 接口|算力|tops|有哪些.{0,16}usb\s*接口/i;

/**
 * High-confidence official start pages. First match wins.
 * Add a row here when a real question has a known best-practice page.
 * Do not add a row when the official page is still ambiguous.
 */
export const OFFICIAL_PATHS: OfficialPath[] = [
  {
    id: "x5-hardware-intro",
    title: "硬件简介",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5`,
    manual: "rdk-x",
    why: "X5 规格（接口路数、供电、算力）看现网有正文的硬件简介，不要空壳页。",
    query: SPEC_QUERY,
    manuals: ["rdk-x"],
    scope: "product",
    product: /x5/i,
    boards: ["x5"],
  },
  {
    id: "s600-hardware-kit",
    title: "RDK S600 开发者套件",
    url: `${ORIGIN}/rdk_s_doc/01_Quick_start/01_hardware_introduction/02_rdk_s600/01_rdk_s600_kit`,
    manual: "rdk-s",
    why: "S600 规格看现网有正文的开发者套件页。",
    query: SPEC_QUERY,
    manuals: ["rdk-s"],
    scope: "product",
    product: /s600/i,
    boards: ["s600"],
  },
  {
    id: "x3-hardware-home",
    title: "RDK X 系列手册",
    url: `${ORIGIN}/rdk_x_doc/RDK`,
    manual: "rdk-x",
    why: "X3 硬件简介现网是空壳，规格题钉到手册首页，不要空壳 URL。",
    query: SPEC_QUERY,
    manuals: ["rdk-x"],
    scope: "product",
    product: /x3/i,
    boards: ["x3"],
  },
  {
    id: "s100-hardware-home",
    title: "RDK S 系列手册",
    url: `${ORIGIN}/rdk_s_doc/RDK`,
    manual: "rdk-s",
    why: "S100 kit 页现网是空壳，规格题钉到手册首页。",
    query: SPEC_QUERY,
    manuals: ["rdk-s"],
    scope: "product",
    product: /s100|s100p/i,
    boards: ["s100"],
  },
  {
    id: "s100-burn",
    title: "3.7.4 S100 烧录",
    url: `${ORIGIN}/rdk_studio_doc/user-guide/system-flashing/s100-xburn`,
    manual: "rdk-studio",
    why: "S100 官方烧录在 RDK Studio / XBurn，不在 S 系列手册的音频或驱动页。",
    query: /烧录|镜像|flash/i,
    manuals: ["rdk-s", "rdk-studio", "xburn"],
    scope: "product",
    product: /s100|s100p/i,
    boards: ["s100"],
  },
  {
    id: "x5-sd-flash",
    title: "烧录系统镜像",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/system-burn/burn-sd-card`,
    manual: "rdk-x",
    why: "X 系列 SD 卡烧录的官方步骤页。",
    query: /flash\s*sd|(?:烧录|镜像).{0,12}sd|sd.{0,12}(?:烧录|镜像)/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
    boards: ["x5"],
  },
  {
    id: "x5-burn",
    title: "烧录概述",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/system-burn/overview`,
    manual: "rdk-x",
    why: "X 系列烧录从概述进入，再选 SD 卡或 eMMC。",
    query: /烧录|镜像|flash|burn/i,
    manuals: ["rdk-x"],
    scope: "product",
    product: /x5|x3|rdk\s*x/i,
  },
  {
    id: "x5-poe",
    title: "PoE 供电使用",
    url: `${ORIGIN}/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE`,
    manual: "rdk-x",
    why: "X5 PoE 的官方硬件说明。",
    query: /poe/i,
    manuals: ["rdk-x"],
    scope: "product",
    product: /x5/i,
    boards: ["x5"],
  },
  {
    id: "tros-install",
    title: "安装 tros.b",
    url: `${ORIGIN}/tros_doc/quick_start/install_tros`,
    manual: "tros",
    why: "TROS 安装走 install_tros，不是交叉编译。",
    query: /安装|install/i,
    manuals: ["tros"],
    scope: "product",
    product: /tros|togetheros/i,
  },
  {
    id: "rdk-cases",
    title: "RDK S600 应用案例",
    url: `${ORIGIN}/case_doc/case`,
    manual: "case-s600",
    why: "官方案例手册首页，不要先打开单个 UART/USB 示例。",
    query: /案例/,
    manuals: ["case-s600"],
    scope: "global",
  },
  {
    id: "x5-wifi",
    title: "1.4 远程登录",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/remote_login`,
    manual: "rdk-x",
    why: "X 系列连 Wi-Fi / 远程登录的官方入口，不是配件清单。",
    query: /wifi|wi-fi|无线/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "x5-gpio",
    title: "GPIO 应用",
    url: `${ORIGIN}/rdk_x_doc/Basic_Application/01_40pin_user_sample/gpio`,
    manual: "rdk-x",
    why: "X 系列 40pin GPIO 用法，不是 config.txt。",
    query: /gpio/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "xburn-overview",
    title: "XBurn 概述",
    url: `${ORIGIN}/xburn_doc/overview`,
    manual: "xburn",
    why: "先看 XBurn 概述，再进安装或批量烧录细节。",
    query: /xburn/i,
    manuals: ["xburn"],
    scope: "product",
    product: /xburn/i,
  },
  {
    id: "s-get-started",
    title: "1.6 资源汇总",
    url: `${ORIGIN}/rdk_s_doc/Quick_start/download`,
    manual: "rdk-s",
    why: "S 系列上手从快速开始的资源汇总进入，不是开机自启动。",
    query: /上手|开箱|入门配置|快速入门/,
    manuals: ["rdk-s"],
    scope: "product",
    product: /s100|s600|s系列/,
  },
  {
    id: "s600-burn",
    title: "烧录步骤",
    url: `${ORIGIN}/rdk_s_doc/Quick_start/install_os/rdk_s600/burn`,
    manual: "rdk-s",
    why: "S600 官方烧录在 S 系列快速开始，不是 S100 的 Studio XBurn 页。",
    query: /烧录|镜像|flash/i,
    manuals: ["rdk-s", "rdk-studio"],
    scope: "product",
    product: /s600/i,
    boards: ["s600"],
  },
  {
    id: "studio-flash",
    title: "3.7 烧录",
    url: `${ORIGIN}/rdk_studio_doc/user-guide/system-flashing/`,
    manual: "rdk-studio",
    why: "Studio 烧录总入口，再按板型选 S100 / TF / eMMC。",
    query: /烧录|flash/i,
    manuals: ["rdk-studio"],
    scope: "named-manual",
  },
  {
    id: "x5-miniboot",
    title: "升级 miniboot",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/system-burn/upgrade-miniboot`,
    manual: "rdk-x",
    why: "X 系列 miniboot 升级走烧录章节，不是命令手册页。",
    query: /miniboot/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "x5-rdkos-info",
    title: "rdkos_info",
    url: `${ORIGIN}/rdk_x_doc/Appendix/rdk-command-manual/cmd_rdkos_info`,
    manual: "rdk-x",
    why: "查 RDK OS 版本用 rdkos_info 命令页。",
    query: /rdkos_info|rdk\s*os|系统版本/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "x5-remote",
    title: "1.4 远程登录",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/remote_login`,
    manual: "rdk-x",
    why: "SSH / 远程登录走快速开始，不是 linux 命令手册。",
    query: /ssh|远程登录/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "x5-hdmi",
    title: "HDMI",
    url: `${ORIGIN}/rdk_x_doc/Quick_start/display_use/display_rdkx5`,
    manual: "rdk-x",
    why: "X5 显示输出的官方页。",
    query: /hdmi/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
    boards: ["x5"],
  },
  {
    id: "x5-usb-camera",
    title: "USB 摄像头使用",
    url: `${ORIGIN}/rdk_x_doc/Basic_Application/vision/RDK_X5/usb_camera`,
    manual: "rdk-x",
    why: "X5 USB 摄像头用法，不是底层 multimedia demo。",
    query: /usb.{0,12}摄像头|usb\s*camera/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
    boards: ["x5"],
  },
  {
    id: "x5-can",
    title: "CAN 使用",
    url: `${ORIGIN}/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/can`,
    manual: "rdk-x",
    why: "X5 CAN 官方硬件说明。",
    query: /\bcan\b|CAN/,
    manuals: ["rdk-x"],
    scope: "named-manual",
    boards: ["x5"],
  },
  {
    id: "x5-i2c",
    title: "I2C 应用",
    url: `${ORIGIN}/rdk_x_doc/Basic_Application/01_40pin_user_sample/i2c`,
    manual: "rdk-x",
    why: "X 系列 40pin I2C 用法。",
    query: /i2c/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "x5-thermal",
    title: "2.4 Thermal 和 CPU 频率管理",
    url: `${ORIGIN}/rdk_x_doc/System_configuration/frequency_management`,
    manual: "rdk-x",
    why: "风扇 / 散热 / 温度问的是 Thermal 配置，不是工具链概述。",
    query: /风扇|散热|thermal|温度/i,
    manuals: ["rdk-x"],
    scope: "named-manual",
  },
  {
    id: "s100-gpio",
    title: "GPIO 使用",
    url: `${ORIGIN}/rdk_s_doc/Advanced_development/linux_development/driver_development_super/driver_gpio_dev`,
    manual: "rdk-s",
    why: "S100 GPIO 走驱动说明，不要打开 S600 的 40pin 示例。",
    query: /gpio/i,
    manuals: ["rdk-s"],
    scope: "product",
    product: /s100|s100p/i,
    boards: ["s100"],
  },
  {
    id: "s600-gpio",
    title: "3.3.2.2 GPIO 应用",
    url: `${ORIGIN}/rdk_s_doc/Basic_Application/03_40pin_user_guide/s600/gpio`,
    manual: "rdk-s",
    why: "S600 40pin GPIO 应用页。",
    query: /gpio/i,
    manuals: ["rdk-s"],
    scope: "product",
    product: /s600/i,
    boards: ["s600"],
  },
  {
    id: "s-network",
    title: "2.1 网络与蓝牙配置",
    url: `${ORIGIN}/rdk_s_doc/System_configuration/network_bluetooth`,
    manual: "rdk-s",
    why: "S 系列连网从系统配置进入，不是 Wi-Fi 性能测试。",
    query: /wifi|wi-fi|无线|网络|蓝牙/i,
    manuals: ["rdk-s"],
    scope: "named-manual",
  },
  {
    id: "tros-cross",
    title: "5.1.3 源码安装",
    url: `${ORIGIN}/tros_doc/quick_start/cross_compile`,
    manual: "tros",
    why: "交叉编译 / 源码安装走 cross_compile。",
    query: /交叉编译|源码安装|cross_compile|cross compile/i,
    manuals: ["tros"],
    scope: "named-manual",
  },
  {
    id: "xburn-install",
    title: "安装 XBurn",
    url: `${ORIGIN}/xburn_doc/install`,
    manual: "xburn",
    why: "问怎么安装 XBurn 时给安装页，概述留给「是什么」。",
    query: /安装|install/i,
    manuals: ["xburn"],
    scope: "named-manual",
  },
  {
    id: "studio-moss",
    title: "1.2 核心架构",
    url: `${ORIGIN}/rdk_studio_doc/product-intro/architecture`,
    manual: "rdk-studio",
    why: "Moss 是什么先看产品架构，不是 dmoss-agent CLI。",
    query: /moss/i,
    manuals: ["rdk-studio"],
    scope: "named-manual",
  },
  {
    id: "x5-sdk-env",
    title: "4.1. 搭建开发环境及编译说明",
    url: `${ORIGIN}/x5_sdk_doc/linux_development/bsp_develop.html`,
    manual: "x5-sdk",
    why: "芯片 SDK 搭环境的官方页。",
    query: /开发环境|搭建|编译/i,
    manuals: ["x5-sdk"],
    scope: "named-manual",
  },
  {
    id: "oe-x5-quant",
    title: "5.1. PTQ、QAT 简介",
    url: `${ORIGIN}/oe_x5_doc/cn/oe_mapper/source/faststart/ptq_qat_overview.html`,
    manual: "oe-x5",
    why: "X5 OE 量化从 PTQ/QAT 简介进入，再选 PTQ 或 QAT 快速上手。",
    query: /量化|ptq|qat/i,
    manuals: ["oe-x5"],
    scope: "named-manual",
  },
  {
    id: "oe-x3-quant",
    title: "3.2. 算法模型 PTQ 量化+上板 快速上手",
    url: `${ORIGIN}/oe_x3_doc/cn/oe_mapper/source/faststart/quickstart.html`,
    manual: "oe-x3",
    why: "X3 OE 量化快速上手。",
    query: /量化|ptq|qat/i,
    manuals: ["oe-x3"],
    scope: "named-manual",
  },
  {
    id: "stereo",
    title: "RDK 双目摄像头手册",
    url: `${ORIGIN}/accessories_stereo_camera_doc/overview`,
    manual: "stereo-camera",
    why: "双目模组从手册概述进入。",
    query: /双目|stereo/i,
    manuals: ["stereo-camera"],
    scope: "product",
    product: /双目|stereo/i,
  },
  {
    id: "bmi088",
    title: "产品简介",
    url: `${ORIGIN}/accessories_bmi088_doc/introduction`,
    manual: "bmi088",
    why: "BMI088 资料从产品简介进入，不是软件概述。",
    query: /bmi088|imu/i,
    manuals: ["bmi088"],
    scope: "product",
    product: /bmi088|imu/i,
  },
  {
    id: "magicbox",
    title: "1. 产品概述",
    url: `${ORIGIN}/magicbox_doc/magicbox`,
    manual: "magicbox",
    why: "Magicbox 是什么先看产品概述，再进快速入门。",
    query: /magicbox|magic\s*box/i,
    manuals: ["magicbox"],
    scope: "product",
    product: /magicbox|magic\s*box/i,
  },
  {
    id: "model-zoo",
    title: "4.1.1 Model Zoo 概述",
    url: `${ORIGIN}/model_zoo_doc/model_zoo_intro`,
    manual: "model-zoo",
    why: "YOLO / 算法案例从 Model Zoo 概述进入。",
    query: /yolo|model\s*zoo|模型zoo/i,
    manuals: ["model-zoo"],
    scope: "product",
    product: /yolo|model\s*zoo/i,
  },
  {
    id: "oe-s-bev",
    title: "Bev多任务模型训练",
    url: `${ORIGIN}/oe_s_doc/guide/advanced_content/hat/examples/bev`,
    manual: "oe-s",
    why: "S 系列 OE 的 BEV 多任务训练页。",
    query: /bev/i,
    manuals: ["oe-s"],
    scope: "named-manual",
  },
  {
    id: "oe-llm-qwen",
    title: "DeepSeek-R1-Distill-Qwen Model Development",
    url: `${ORIGIN}/oe_llm_s100p_doc/en/guide/quickstart/S100P/deepseek_r1_distill_qwen`,
    manual: "oe-llm-s100",
    why: "S100 OE LLM 跑 Qwen 的官方 quickstart。",
    query: /qwen/i,
    manuals: ["oe-llm-s100"],
    scope: "named-manual",
  },
  {
    id: "oe-llm-whisper",
    title: "Whisper On-Device Execution",
    url: `${ORIGIN}/oe_llm_s600_doc/en/guide/quickstart/asr_model/whisper`,
    manual: "oe-llm-s600",
    why: "S600 OE LLM 跑 Whisper 的官方页。",
    query: /whisper/i,
    manuals: ["oe-llm-s600"],
    scope: "named-manual",
  },
];

function mentionsProduct(path: OfficialPath, query: string, manual?: string): boolean {
  if (!path.product) return true;
  return path.product.test(query) || Boolean(manual && path.product.test(manual));
}

function boardConflict(path: OfficialPath, query: string): boolean {
  if (!path.boards?.length) return false;
  const mentioned = mentionedBoards(query);
  if (mentioned.length === 0) return false;
  if (mentioned.length > 1) return true;
  return !path.boards.includes(mentioned[0]!);
}

export function matchOfficialPath(query: string, manual?: string): OfficialPath | undefined {
  if (manual && isForumRef(manual)) return undefined;
  const resolved = manual ? resolveManual(manual)?.id : undefined;
  for (const path of OFFICIAL_PATHS) {
    if (!path.query.test(query)) continue;
    if (resolved) {
      if (!path.manuals.includes(resolved)) continue;
      if (path.scope === "product" && !mentionsProduct(path, query, manual)) continue;
      if (boardConflict(path, query)) continue;
      return path;
    }
    if (path.scope === "named-manual") continue;
    if (path.scope === "product" && !mentionsProduct(path, query, manual)) continue;
    if (boardConflict(path, query)) continue;
    return path;
  }
  return undefined;
}

export function applyOfficialPath(
  hits: SearchHit[],
  path: OfficialPath | undefined,
  limit: number,
): SearchHit[] {
  const labeled = hits.map((hit) => ({
    ...hit,
    role: hit.source === "forum" ? ("forum-supplement" as const) : ("related" as const),
  }));
  if (!path) return labeled.slice(0, limit);

  const start: SearchHit = {
    title: path.title,
    url: path.url,
    manual: path.manual,
    snippet: path.why,
    score: 1000,
    source: "docs",
    role: "official-start",
  };
  const rest = labeled.filter((hit) => (hit.url.split("#")[0] ?? hit.url) !== path.url);
  return [start, ...rest].slice(0, limit);
}

export function searchGuidance(path?: OfficialPath): string {
  if (path) {
    return "Open the official-start hit first with get_page. related hits are secondary. forum-supplement is unofficial community experience.";
  }
  return "Prefer official docs hits. Open the first docs URL with get_page. forum-supplement is unofficial.";
}
