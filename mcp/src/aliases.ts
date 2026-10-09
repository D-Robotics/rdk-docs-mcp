/**
 * Retrieval aliases for agent queries. Spelling fixes stay in glossary-aliases.ts
 * (generated). These map a tool name or phrase onto the words the manuals actually use.
 * `hbm_shell` and `sun55iw3` are not in the indexed manuals; only the first has a
 * documented neighbour (the HBM CLI). Do not invent a page for an unknown codename.
 */
export const RETRIEVAL_ALIASES: Record<string, string[]> = {
  hbm_shell: ["hrt_model_exec", "hb_model_info"],
  hobot_dnn: ["pyeasy_dnn", "hbm_runtime"],
  hbm_runtime: ["hbm"],
  ptq: ["量化"],
  qat: ["量化"],
  量化: ["ptq", "qat"],
  烧录: ["flash"],
  flash: ["烧录", "burn"],
  软件源: ["apt", "sources.list"],
  apt: ["软件源"],
  管脚: ["40pin", "引脚"],
  引脚: ["40pin", "管脚"],
  gpio: ["管脚"],
  摄像头: ["camera", "mipi"],
  camera: ["摄像头"],
  无图: ["黑屏"],
  黑屏: ["无图"],
  wifi: ["无线"],
  无线: ["wifi"],
  推理: ["inference"],
  inference: ["推理"],
};
