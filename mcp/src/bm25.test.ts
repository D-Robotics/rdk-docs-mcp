import { describe, expect, it } from "vitest";
import { manualMatchesBoards } from "./bm25.js";
import { matchQuality, rankHits } from "./search.js";
import type { IndexedDoc } from "./types.js";

function doc(partial: Partial<IndexedDoc> & Pick<IndexedDoc, "title" | "url">): IndexedDoc {
  return { manualId: "rdk-x", kind: "page", ...partial };
}

describe("bm25", () => {
  it("ranks a title match above the same words buried in the body", () => {
    const hits = rankHits(
      [
        doc({
          title: "其他说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/other",
          text: "烧录 烧录 烧录 烧录",
        }),
        doc({ title: "系统烧录", url: "https://developer.d-robotics.cc/rdk_x_doc/flash" }),
      ],
      "烧录",
      5,
    );
    expect(hits[0]?.title).toBe("系统烧录");
  });

  it("matches an identifier with the underscores removed", () => {
    const hits = rankHits(
      [doc({ title: "hobot_dnn 推理", url: "https://developer.d-robotics.cc/rdk_x_doc/hobot_dnn" })],
      "hobotdnn",
      3,
    );
    expect(hits[0]?.url).toContain("hobot_dnn");
    expect(hits[0]?.quality).toBe("good");
  });

  it("drops an S-series OE page when the query names X5", () => {
    const hits = rankHits(
      [
        doc({
          manualId: "oe-s",
          title: "Docker 示例",
          url: "https://developer.d-robotics.cc/oe_s_doc/en/guide/docker",
          text: "docker iptables",
        }),
        doc({
          manualId: "rdk-x",
          title: "X5 快速开始",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/rdk_x5",
          text: "RDK X5",
        }),
      ],
      "x5 docker",
      5,
    );
    expect(hits.some((hit) => hit.manual === "oe-s")).toBe(false);
  });

  it("abstains when the query shares no real terms with the corpus", () => {
    const docs = [doc({ title: "GPIO 应用", url: "https://developer.d-robotics.cc/rdk_x_doc/gpio", text: "40pin 电平" })];
    const query = "excel 数据透视表怎么做";
    const hits = rankHits(docs, query, 5);
    const quality = matchQuality(hits, [docs], query);
    expect(quality.noGoodMatch).toBe(true);
    expect(quality.confidence).toBeGreaterThanOrEqual(0);
    expect(quality.confidence).toBeLessThanOrEqual(1);
  });

  it("does not abstain when the query names a topic that is actually in the manual", () => {
    const docs = [doc({ title: "系统烧录", url: "https://developer.d-robotics.cc/rdk_x_doc/burn", text: "烧录镜像" })];
    expect(matchQuality(rankHits(docs, "怎么把系统烧录一下，老是失败", 5), [docs], "怎么把系统烧录一下，老是失败").noGoodMatch).toBe(false);
  });

  it("abstains when the only RDK token is a board name next to an unknown command", () => {
    const docs = [
      doc({
        title: "X5 镜像",
        url: "https://developer.d-robotics.cc/rdk_x_doc/x5/docker",
        text: "x5 docker 镜像",
      }),
    ];
    const query = "x5 上 docker 起不来，报 iptables 错误";
    expect(matchQuality(rankHits(docs, query, 3), [docs], query).noGoodMatch).toBe(true);
  });

  it("abstains on unrelated questions even when a generic word is in the manual", () => {
    const docs = [
      doc({
        title: "环境准备",
        url: "https://developer.d-robotics.cc/rdk_x_doc/setup",
        text: "docker install login 登录 可用于对照",
      }),
    ];
    for (const query of ["docker postgres 连不上", "vue3 login guard 怎么写", "WeChat migration 失败", "nginx 反代一直 502", "特斯拉刹车片怎么换"]) {
      expect(matchQuality(rankHits(docs, query, 5), [docs], query).noGoodMatch).toBe(true);
    }
  });

  it("abstains only when a command token is missing from the corpus and the top hit", () => {
    const docs = [doc({ title: "GPIO 应用", url: "https://developer.d-robotics.cc/rdk_x_doc/gpio", text: "40pin 电平" })];
    const missing = "nginx 反代一直 502";
    expect(matchQuality(rankHits(docs, missing, 5), [docs], missing).noGoodMatch).toBe(true);
    const documented = [
      doc({
        title: "nginx 反向代理",
        url: "https://developer.d-robotics.cc/rdk_x_doc/nginx",
        text: "nginx 配置",
      }),
    ];
    const present = "nginx 怎么反代";
    expect(matchQuality(rankHits(documented, present, 5), [documented], present).noGoodMatch).toBe(false);
  });

  it("does not abstain when a typo of a documented command is the query", () => {
    const docs = [doc({ title: "V4L2 使用", url: "https://developer.d-robotics.cc/rdk_x_doc/v4l2", text: "v4l2 节点" })];
    const query = "v4l2ctl 列不出节点";
    const hits = rankHits(docs, query, 3);
    expect(matchQuality(hits, [docs], query).noGoodMatch).toBe(false);
  });

  it("does not abstain when filler words miss but a distinctive term is in the corpus", () => {
    const hits = rankHits(
      [doc({ title: "系统烧录", url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/system-burn" })],
      "怎么把系统烧录一下，老是失败",
      5,
    );
    const quality = matchQuality(hits);
    expect(quality.noGoodMatch).toBe(false);
    expect(hits[0]?.confidence).toBeGreaterThan(0.4);
  });

  it("prefers a guide with numbered steps over a one-line mention of the same words", () => {
    const hits = rankHits(
      [
        doc({
          title: "烧录命令",
          url: "https://developer.d-robotics.cc/rdk_x_doc/commands/dd",
          text: "烧录 镜像到 sd 卡",
        }),
        doc({
          title: "烧录指南",
          url: "https://developer.d-robotics.cc/rdk_x_doc/start/burn",
          text: "1. 烧录 镜像到 sd 卡\n2. 校验写入结果",
        }),
      ],
      "镜像怎么烧录到卡上",
      5,
    );
    expect(hits[0]?.title).toBe("烧录指南");
  });

  it("downranks a long multi-topic section against a short guide", () => {
    const broad = `humble 安装说明。${"这是另一个问题？".repeat(12)}${"填充内容用于拉长这一节。".repeat(40)}`;
    const hits = rankHits(
      [
        doc({
          title: "Humble 说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/tros",
          text: broad,
        }),
        doc({
          title: "Humble 说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/install",
          text: "安装步骤",
        }),
      ],
      "humble 怎么安装",
      5,
    );
    expect(hits[0]?.url).toContain("Quick_start/install");
  });

  it("lets a rare token beat a title full of generic collision words", () => {
    const filler = Array.from({ length: 24 }, (_, i) =>
      doc({
        title: `note ${i}`,
        url: `https://developer.d-robotics.cc/rdk_x_doc/note-${i}`,
        text: "docker error static ip",
      }),
    );
    const hits = rankHits(
      [
        ...filler,
        doc({
          title: "docker error",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/docker-error",
          text: "error docker static",
        }),
        doc({
          title: "网络配置",
          url: "https://developer.d-robotics.cc/rdk_x_doc/System_configuration/iptables",
          text: "iptables",
        }),
      ],
      "docker error iptables",
      5,
    );
    expect(hits[0]?.url).toContain("iptables");
  });

  it("keeps one hit from each board when the query names neither", () => {
    const hits = rankHits(
      [
        doc({
          title: "BPU API",
          url: "https://developer.d-robotics.cc/rdk_x_doc/RDK_X3/bpu_api",
          text: "BPU inference",
        }),
        doc({
          title: "BPU API",
          url: "https://developer.d-robotics.cc/rdk_x_doc/RDK_X5/bpu_api",
          text: "BPU inference",
        }),
      ],
      "BPU inference",
      5,
    );
    expect(hits[0]?.board).not.toBe(hits[1]?.board);
    expect(hits.map((hit) => hit.board).sort()).toEqual(["x3", "x5"]);
  });

  it("keeps a burn page when the only unknown token is a host tool name", () => {
    const docs = [
      doc({
        title: "烧录系统镜像",
        url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/system-burn",
        text: "烧录 镜像",
      }),
    ];
    const query = "用 balenaEtcher 烧录 镜像";
    const hits = rankHits(docs, query, 3);
    expect(matchQuality(hits, [docs], query).noGoodMatch).toBe(false);
    expect(hits[0]?.url).toContain("system-burn");
  });

  it("abstains on kubernetes and on an iPhone question", () => {
    const docs = [doc({ title: "安装依赖", url: "https://developer.d-robotics.cc/rdk_x_doc/install", text: "安装 conda" })];
    for (const query of ["kubernetes helm install 一直 pending", "iPhone 卡在恢复模式退不出来"]) {
      expect(matchQuality(rankHits(docs, query, 3), [docs], query).noGoodMatch).toBe(true);
    }
  });

  it("corrects a transposed wifi typo onto the wireless page", () => {
    const hits = rankHits(
      [
        doc({ title: "其他", url: "https://developer.d-robotics.cc/rdk_x_doc/other", text: "gpio" }),
        doc({
          title: "无线网络",
          url: "https://developer.d-robotics.cc/rdk_x_doc/System_configuration/network",
          text: "wifi 无线",
        }),
      ],
      "wfii",
      3,
    );
    expect(hits[0]?.url).toContain("network");
  });

  it("does not treat a one-edit neighbor with a different first letter as a typo", () => {
    const docs = [doc({ title: "sending a file", url: "https://developer.d-robotics.cc/rdk_x_doc/send", text: "sending" })];
    expect(matchQuality(rankHits(docs, "pending", 3), [docs], "pending").noGoodMatch).toBe(true);
  });

  it("does not correct iphone into phone", () => {
    const docs = [doc({ title: "phone", url: "https://developer.d-robotics.cc/rdk_x_doc/phone", text: "phone call" })];
    expect(matchQuality(rankHits(docs, "iphone", 3), [docs], "iphone").noGoodMatch).toBe(true);
  });

  it("expands a yolo prefix onto the documented yolov5 page", () => {
    const hits = rankHits(
      [doc({ title: "yolov5 检测", url: "https://developer.d-robotics.cc/model_zoo_doc/object_detection", text: "yolov5 模型示例" })],
      "YOLO 模型示例",
      3,
    );
    expect(hits[0]?.url).toContain("model_zoo");
  });

  it("does not abstain when a how-to glues the topic word to the next word", () => {
    const docs = [
      doc({
        title: "USB 摄像头使用",
        url: "https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/vision/RDK_X3/usb_camera",
        text: "USB 摄像头预览 不出图",
      }),
    ];
    const query = "USB 摄像头插上了但是不出图";
    expect(matchQuality(rankHits(docs, query, 3), [docs], query).noGoodMatch).toBe(false);
  });

  it("abstains when the query is another vendor board and none of its terms are in the manual", () => {
    const docs = [
      doc({
        title: "系统烧录",
        url: "https://developer.d-robotics.cc/rdk_x_doc/burn",
        text: "烧录镜像",
      }),
    ];
    const query = "Jetson Orin Nano CSI bring up";
    expect(matchQuality(rankHits(docs, query, 3), [docs], query).noGoodMatch).toBe(true);
  });

  it("prefers the page that contains the pasted error string", () => {
    const hits = rankHits(
      [
        doc({
          title: "ValueError 说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/generic",
          text: "ValueError 通常是参数类型不对",
        }),
        doc({
          title: "摄像头示例",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/interface",
          text: "ValueError: invalid literal for int() with base 10: lt8618_ioctl failed device not open",
        }),
      ],
      "报错 ValueError: invalid literal for int() with base 10: lt8618_ioctl failed",
      3,
    );
    expect(hits[0]?.url).toContain("FAQ/interface");
  });

  it("drops a page whose path only suffixes the other board", () => {
    const hits = rankHits(
      [
        doc({
          title: "调用接口",
          url: "https://developer.d-robotics.cc/rdk_x_doc/linux_development/driver_development_x5/gpio",
          text: "调用接口 X5",
        }),
        doc({
          title: "BPU 算法推理",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/RDK_X3/bpu",
          text: "X3 BPU Python 推理",
        }),
      ],
      "X3 BPU Python 推理",
      3,
    );
    expect(hits[0]?.url).toContain("RDK_X3/bpu");
    expect(hits[0]?.url).not.toContain("driver_development_x5");
  });

  it("matches a toolchain command to its stemmed index form", () => {
    const hits = rankHits(
      [
        doc({
          title: "其他工具",
          url: "https://developer.d-robotics.cc/oe_x3_doc/other.html",
          text: "hb_perf",
        }),
        doc({
          title: "模型修改",
          url: "https://developer.d-robotics.cc/oe_x3_doc/modifier.html",
          text: "hb_model_modifi",
        }),
      ],
      "hb_model_modifier",
      3,
    );
    expect(hits[0]?.url).toContain("modifier.html");
    expect(hits[0]?.quality).toBe("good");
  });

  it("prefers the longer in-corpus word over a version-stamp heading", () => {
    const hits = rankHits(
      [
        doc({
          title: "版本号：2.1.0",
          url: "https://developer.d-robotics.cc/rdk_x_doc/RDK#版本号210",
          kind: "heading",
          text: "RDK X3 2.1.0",
        }),
        doc({
          title: "如何查看板卡的系统版本号",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system#q2",
          kind: "heading",
          text: "使用以下命令 cat /etc/version",
        }),
      ],
      "X3 板子系统版本号用什么命令看",
      3,
    );
    expect(hits[0]?.url).toContain("hardware_and_system");
  });

  it("ranks the symptom question above the short model title", () => {
    const hits = rankHits(
      [
        doc({
          title: "yolov5 模型",
          url: "https://developer.d-robotics.cc/rdk_x_doc/yolov5_sample",
          text: "示例简介",
        }),
        doc({
          title: "YOLOv5 部署时检测框都聚集在图像的左上角是什么原因",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/toolchain#q11",
          kind: "heading",
          text: "后处理库参数传递问题，检测框聚集在左上角",
        }),
      ],
      "YOLOv5 部署后检测框都挤在图像左上角",
      3,
    );
    expect(hits[0]?.url).toContain("toolchain");
  });

  it("keeps a short heading ahead of the same words in an FAQ answer", () => {
    const hits = rankHits(
      [
        doc({
          title: "40PIN 接口定义",
          url: "https://developer.d-robotics.cc/rdk_x_doc/pin#40pin",
          kind: "heading",
          text: "管脚定义",
        }),
        doc({
          title: "常见问题",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware#q",
          kind: "heading",
          answer: `${"40PIN 接口定义 ".repeat(40)}其他说明`,
        }),
      ],
      "40PIN 接口定义",
      3,
    );
    expect(hits[0]?.url).toContain("pin#40pin");
  });

  it("still finds a rare token that occurs only in the FAQ answer", () => {
    const hits = rankHits(
      [
        doc({
          title: "常见问题",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/toolchain#q11",
          kind: "heading",
          answer: "检测框聚集在左上角，后处理库参数没有传对",
        }),
        doc({
          title: "示例简介",
          url: "https://developer.d-robotics.cc/rdk_x_doc/yolov5_sample",
          text: "模型示例",
        }),
      ],
      "检测框聚集在左上角",
      3,
    );
    expect(hits[0]?.url).toContain("toolchain");
  });

  it("prefers the usage page over a spec heading for a preview question", () => {
    const hits = rankHits(
      [
        doc({
          title: "USB 摄像头",
          url: "https://developer.d-robotics.cc/rdk_x_doc/hardware_introduction/rdk_x3#usb",
          kind: "heading",
          text: "开发板 USB 接口支持摄像头",
        }),
        doc({
          title: "USB 摄像头使用",
          url: "https://developer.d-robotics.cc/rdk_x_doc/vision/RDK_X3/usb_camera",
          text: "采集 USB 摄像头的图像并预览",
        }),
      ],
      "X3 USB 摄像头怎么预览画面",
      3,
    );
    expect(hits[0]?.url).toContain("usb_camera");
  });

  it("keeps the winning question title instead of the section page title", () => {
    const hits = rankHits(
      [
        doc({
          title: "AI 模型与工具链",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/toolchain",
          text: "工具链",
        }),
        doc({
          title: "检测框聚集在左上角是什么原因",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/toolchain#q11",
          kind: "heading",
          text: "YOLOv5 部署后检测框都挤在图像左上角，后处理参数没有传对",
        }),
      ],
      "YOLOv5 检测框都挤在图像左上角",
      3,
    );
    expect(hits[0]?.title).toContain("左上角");
    expect(hits[0]?.url).toContain("#q11");
  });

  it("abstains on a library name the manuals never use when the query has no in-corpus topic", () => {
    const docs = [
      doc({
        title: "系统烧录",
        url: "https://developer.d-robotics.cc/rdk_s_doc/burn",
        text: "烧录镜像",
      }),
    ];
    const query = "Raspberry Pi 5 用 libcamera 预览";
    expect(matchQuality(rankHits(docs, query, 3), [docs], query).noGoodMatch).toBe(true);
  });

  it("blocks S-series manuals for an X-only board and the reverse", () => {
    expect(manualMatchesBoards("oe-s", ["x5"])).toBe(false);
    expect(manualMatchesBoards("oe-x5", ["x5"])).toBe(true);
    expect(manualMatchesBoards("oe-x5", ["x3"])).toBe(false);
    expect(manualMatchesBoards("oe-x3", ["x3"])).toBe(true);
    expect(manualMatchesBoards("rdk-x", ["s100"])).toBe(false);
    expect(manualMatchesBoards("rdk-ultra", ["s100"])).toBe(false);
    expect(manualMatchesBoards("rdk-ultra", ["x5"])).toBe(false);
    expect(manualMatchesBoards("rdk-ultra", ["x3"])).toBe(false);
    expect(manualMatchesBoards("rdk-ultra", [])).toBe(true);
    expect(manualMatchesBoards("tros", ["x3"])).toBe(true);
    expect(manualMatchesBoards("oe-s", ["x5", "s100"])).toBe(true);
  });
});
