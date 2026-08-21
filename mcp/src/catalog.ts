export type IndexKind = "docusaurus" | "sphinx" | "none";

export type Manual = {
  id: string;
  title: string;
  category: string;
  description: string;
  homeUrl: string;
  basePath: string;
  aliases: string[];
  searchable: boolean;
  indexKind: IndexKind;
  indexPath?: string;
};

const ORIGIN = "https://developer.d-robotics.cc";

export const MANUALS: Manual[] = [
  {
    id: "rdk-x",
    title: "RDK X 系列用户手册",
    category: "RDK 用户手册",
    description: "RDK X3 / X3 Module / X5 / X5 Module 使用说明与开发指导。",
    homeUrl: `${ORIGIN}/rdk_x_doc/RDK`,
    basePath: "/rdk_x_doc",
    aliases: ["x5", "x3", "rdk-x5", "rdk-x3", "x系列"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/rdk_x_doc/search-index.json",
  },
  {
    id: "rdk-s",
    title: "RDK S 系列用户手册",
    category: "RDK 用户手册",
    description: "RDK S100 / S100P / S600 使用说明与开发指导。",
    homeUrl: `${ORIGIN}/rdk_s_doc/RDK`,
    basePath: "/rdk_s_doc",
    aliases: ["s100", "s100p", "s600", "rdk-s100", "rdk-s600", "s系列"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/rdk_s_doc/search-index.json",
  },
  {
    id: "tros",
    title: "TogetheROS.Bot 用户手册",
    category: "机器人应用",
    description: "基于 TogetheROS.Bot 的机器人应用开发指南。",
    homeUrl: `${ORIGIN}/tros_doc/tros`,
    basePath: "/tros_doc",
    aliases: ["togetheros", "togetherros", "tros.bot"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/tros_doc/search-index.json",
  },
  {
    id: "model-zoo",
    title: "Model Zoo 用户手册",
    category: "算法应用 · Model Zoo",
    description: "算法应用开发案例与接口说明。",
    homeUrl: `${ORIGIN}/model_zoo_doc/model_zoo_intro`,
    basePath: "/model_zoo_doc",
    aliases: ["modelzoo", "zoo"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/model_zoo_doc/search-index.json",
  },
  {
    id: "case-s600",
    title: "RDK S600 应用案例用户手册",
    category: "应用开发示例",
    description: "S600 从外设接入到端侧推理、多模态与具身智能的案例。",
    homeUrl: `${ORIGIN}/case_doc/case`,
    basePath: "/case_doc",
    aliases: ["s600-case", "应用案例"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/case_doc/search-index.json",
  },
  {
    id: "magicbox",
    title: "RDK Magicbox 用户手册",
    category: "产品与配件",
    description: "RDK X5 Magicbox 多模态智能平台。",
    homeUrl: `${ORIGIN}/magicbox_doc/magicbox`,
    basePath: "/magicbox_doc",
    aliases: ["magic-box"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/magicbox_doc/search-index.json",
  },
  {
    id: "stereo-camera",
    title: "双目摄像头用户手册",
    category: "产品与配件",
    description: "双目摄像头模组使用说明。",
    homeUrl: `${ORIGIN}/accessories_stereo_camera_doc/overview`,
    basePath: "/accessories_stereo_camera_doc",
    aliases: ["stereo", "双目"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/accessories_stereo_camera_doc/search-index.json",
  },
  {
    id: "bmi088",
    title: "BMI088 IMU 模组用户手册",
    category: "产品与配件",
    description: "BMI088 IMU 模组使用说明。",
    homeUrl: `${ORIGIN}/accessories_bmi088_doc/introduction`,
    basePath: "/accessories_bmi088_doc",
    aliases: ["imu"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/accessories_bmi088_doc/search-index.json",
  },
  {
    id: "rdk-studio",
    title: "RDK Studio 用户手册",
    category: "软件",
    description: "RDK Studio 桌面工作台：Moss、设备连接、烧录、板端 Agent。",
    homeUrl: `${ORIGIN}/rdk_studio_doc/category/1-product-intro`,
    basePath: "/rdk_studio_doc",
    aliases: ["studio"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/rdk_studio_doc/search-index.json",
  },
  {
    id: "xburn",
    title: "XBurn 用户手册",
    category: "软件",
    description: "RDK 系列板级烧录工具。",
    homeUrl: `${ORIGIN}/xburn_doc/overview`,
    basePath: "/xburn_doc",
    aliases: ["burn", "烧录工具"],
    searchable: true,
    indexKind: "docusaurus",
    indexPath: "/xburn_doc/search-index.json",
  },
  {
    id: "oe-s",
    title: "S 系列计算平台 OE 用户手册",
    category: "算法工具链",
    description: "S100 / S100P / S600 OE 使用说明。",
    homeUrl: `${ORIGIN}/oe_s_doc/index.html`,
    basePath: "/oe_s_doc",
    aliases: ["oe", "s-oe"],
    searchable: false,
    indexKind: "none",
  },
  {
    id: "oe-llm-s100",
    title: "S100 OE LLM 用户手册",
    category: "算法工具链",
    description: "S100 LLM 工具链开发流程。",
    homeUrl: `${ORIGIN}/oe_llm_s100p_doc/index.html`,
    basePath: "/oe_llm_s100p_doc",
    aliases: ["s100-llm", "oe-llm"],
    searchable: false,
    indexKind: "none",
  },
  {
    id: "oe-llm-s600",
    title: "S600 OE LLM 用户手册",
    category: "算法工具链",
    description: "S600 LLM 工具链开发流程。",
    homeUrl: `${ORIGIN}/oe_llm_s600_doc/index.html`,
    basePath: "/oe_llm_s600_doc",
    aliases: ["s600-llm"],
    searchable: false,
    indexKind: "none",
  },
  {
    id: "oe-x5",
    title: "X5 OE 用户手册",
    category: "算法工具链",
    description: "X5 算法工具链：训练、转换、部署、推理。",
    homeUrl: `${ORIGIN}/oe_x5_doc/cn/index.html`,
    basePath: "/oe_x5_doc/cn",
    aliases: ["x5-oe"],
    searchable: true,
    indexKind: "sphinx",
    indexPath: "/oe_x5_doc/cn/searchindex.js",
  },
  {
    id: "oe-x3",
    title: "X3 OE 用户手册",
    category: "算法工具链",
    description: "X3 算法工具链：训练、转换、部署、推理。",
    homeUrl: `${ORIGIN}/oe_x3_doc/cn/index.html`,
    basePath: "/oe_x3_doc/cn",
    aliases: ["x3-oe"],
    searchable: true,
    indexKind: "sphinx",
    indexPath: "/oe_x3_doc/cn/searchindex.js",
  },
  {
    id: "x5-sdk",
    title: "X5 芯片用户手册",
    category: "SDK 用户手册",
    description: "X5 芯片方案：环境搭建、评测、软件功能开发。",
    homeUrl: `${ORIGIN}/x5_sdk_doc/`,
    basePath: "/x5_sdk_doc",
    aliases: ["sdk", "x5-chip"],
    searchable: true,
    indexKind: "sphinx",
    indexPath: "/x5_sdk_doc/searchindex.js",
  },
];

export function listManuals(): Manual[] {
  return MANUALS;
}

export function resolveManual(idOrAlias: string): Manual | undefined {
  const key = idOrAlias.trim().toLowerCase();
  return MANUALS.find(
    (manual) =>
      manual.id === key ||
      manual.aliases.some((alias) => alias.toLowerCase() === key),
  );
}

export function origin(): string {
  return ORIGIN;
}
