import { describe, expect, it } from "vitest";
import { compactDocusaurusIndex } from "./docusaurus.js";
import { compactSphinxIndex } from "./sphinx.js";
import { rankHits } from "./search.js";
import type { IndexedDoc } from "./types.js";

const docusaurusFixture = [
  {
    documents: [
      {
        i: 8,
        t: "PoE 供电使用",
        u: "/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE",
        b: ["7 进阶开发", "7.1 RDK X5硬件说明"],
      },
      {
        i: 20,
        t: "系统烧录",
        u: "/rdk_x_doc/Quick_start/flash",
        b: ["1 快速开始"],
      },
    ],
  },
  {
    documents: [
      {
        i: 10,
        t: "协议简介",
        u: "/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE",
        h: "#协议简介",
        p: 8,
      },
    ],
  },
  {
    documents: [
      {
        i: 8,
        t: "目前查阅到 PoE 有多种标准，每个标准的电压，功率都不相同。",
        s: "PoE 供电使用",
        u: "/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE",
        p: 8,
      },
    ],
  },
];

const sphinxFixture = `Search.setIndex({"docnames":["index","linux_development/board_bring_up"],"filenames":["index.rst","linux_development/board_bring_up.rst"],"titles":{"index":"X5 SDK","linux_development/board_bring_up":"Board bring up"},"terms":{},"titleterms":{}});`;

describe("docusaurus index", () => {
  it("compacts pages, headings, and snippets into searchable docs", () => {
    const docs = compactDocusaurusIndex(docusaurusFixture, "rdk-x");
    expect(docs.some((d) => d.title === "PoE 供电使用" && d.kind === "page")).toBe(true);
    expect(docs.some((d) => d.title === "协议简介" && d.kind === "heading")).toBe(true);
    expect(docs.some((d) => d.snippet?.includes("多种标准"))).toBe(true);
  });
});

describe("sphinx index", () => {
  it("reads docnames and titles from Search.setIndex", () => {
    const docs = compactSphinxIndex(sphinxFixture, "x5-sdk", "/x5_sdk_doc");
    expect(docs.map((d) => d.title)).toEqual(
      expect.arrayContaining(["X5 SDK", "Board bring up"]),
    );
    expect(docs.find((d) => d.title === "Board bring up")?.url).toBe(
      "https://developer.d-robotics.cc/x5_sdk_doc/linux_development/board_bring_up.html",
    );
  });
});

describe("rankHits", () => {
  const docs: IndexedDoc[] = compactDocusaurusIndex(docusaurusFixture, "rdk-x");

  it("ranks title matches above unrelated pages and dedupes by url", () => {
    const hits = rankHits(docs, "PoE", 5);
    expect(hits[0]?.title).toMatch(/PoE/);
    expect(hits[0]?.url).toContain("/rdk_x_doc/");
    expect(hits.filter((h) => h.url.includes("/POE")).length).toBe(1);
  });

  it("understands a full Chinese sentence without spaces", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-x",
          title: "示例概述",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/overview",
          kind: "page",
        },
        {
          manualId: "rdk-x",
          title: "Q40: 如何扩展 swap 交换内存？",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system",
          kind: "heading",
          text: "通过 swapfile 扩大交换内存",
        },
      ],
      "怎么扩大swap内存",
      5,
    );
    expect(hits[0]?.url).toContain("FAQ/hardware_and_system");
  });

  it("does not let short ascii tokens match inside longer words", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-x",
          title: "zip",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Appendix/linux-command-manual/cmd_zip",
          kind: "page",
        },
        {
          manualId: "rdk-x",
          title: "ip",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Appendix/linux-command-manual/cmd_ip",
          kind: "page",
        },
      ],
      "怎么查看板子的IP地址",
      5,
    );
    expect(hits[0]?.url).toContain("cmd_ip");
    expect(hits.some((h) => h.url.includes("cmd_zip"))).toBe(false);
  });

  it("does not match bin inside Binocular", () => {
    const hits = rankHits(
      [
        {
          manualId: "oe-s",
          title: "Binocular depth estimation",
          url: "https://developer.d-robotics.cc/oe_s_doc/en/guide/model_zoo",
          kind: "page",
        },
        {
          manualId: "oe-x5",
          title: "模型转换：编译生成 bin 模型",
          url: "https://developer.d-robotics.cc/oe_x5_doc/cn/ptq/quantize_compile.html",
          kind: "page",
        },
      ],
      "怎么把pt模型转成bin模型",
      5,
    );
    expect(hits[0]?.url).toContain("quantize_compile");
    expect(hits.some((h) => h.url.includes("model_zoo"))).toBe(false);
  });

  it("ignores question filler words like 怎么 / 如何", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-x",
          title: "Q1: 怎么办？如何处理常见问题",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/misc",
          kind: "page",
        },
        {
          manualId: "rdk-x",
          title: "温度与散热",
          url: "https://developer.d-robotics.cc/rdk_x_doc/System_configuration/thermal",
          kind: "page",
        },
      ],
      "板子温度太高怎么办",
      5,
    );
    expect(hits[0]?.url).toContain("thermal");
  });

  it("finds Chinese queries such as 烧录", () => {
    const hits = rankHits(docs, "烧录", 5);
    expect(hits[0]?.title).toBe("系统烧录");
  });

  it("puts the official how-to page first for S100 flashing", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-s",
          title: "S100",
          url: "https://developer.d-robotics.cc/rdk_s_doc/Basic_Application/audio/audio_board_super",
          kind: "page",
        },
        {
          manualId: "rdk-studio",
          title: "3.7.4 S100 烧录",
          url: "https://developer.d-robotics.cc/rdk_studio_doc/user-guide/system-flashing/s100-xburn",
          kind: "page",
        },
      ],
      "S100 烧录镜像",
      5,
    );
    expect(hits[0]?.url).toContain("s100-xburn");
  });

  it("prefers the 40pin GPIO how-to over config_txt", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-x",
          title: "gpio",
          url: "https://developer.d-robotics.cc/rdk_x_doc/System_configuration/config_txt",
          kind: "page",
        },
        {
          manualId: "rdk-x",
          title: "GPIO 应用",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/01_40pin_user_sample/gpio",
          kind: "page",
        },
      ],
      "GPIO",
      5,
    );
    expect(hits[0]?.url).toContain("/01_40pin_user_sample/gpio");
  });

  it("prefers remote login over the accessory list for WiFi", () => {
    const hits = rankHits(
      [
        {
          manualId: "rdk-x",
          title: "1.8 配件清单",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/accessory",
          kind: "page",
          snippet: "WiFi 天线",
        },
        {
          manualId: "rdk-x",
          title: "1.4 远程登录",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/remote_login",
          kind: "page",
          snippet: "WiFi 连接",
        },
      ],
      "WiFi",
      5,
    );
    expect(hits[0]?.url).toContain("remote_login");
  });

  it("puts the case handbook first for a case survey", () => {
    const hits = rankHits(
      [
        {
          manualId: "case-s600",
          title: "示例应用",
          url: "https://developer.d-robotics.cc/case_doc/getting_started/uart",
          kind: "page",
        },
        {
          manualId: "case-s600",
          title: "RDK S600 应用案例",
          url: "https://developer.d-robotics.cc/case_doc/case",
          kind: "page",
        },
      ],
      "案例 示例 应用",
      5,
    );
    expect(hits[0]?.url).toMatch(/\/case$/);
  });

  it("does not treat XBurn as a generic burn query", () => {
    const hits = rankHits(
      [
        {
          manualId: "xburn",
          title: "烧录完成自动重启与启动检查",
          url: "https://developer.d-robotics.cc/xburn_doc/basics/auto-reboot",
          kind: "page",
        },
        {
          manualId: "xburn",
          title: "XBurn 概述",
          url: "https://developer.d-robotics.cc/xburn_doc/overview",
          kind: "page",
        },
      ],
      "XBurn",
      5,
    );
    expect(hits[0]?.url).toContain("/overview");
  });

  it("prefers install_tros over cross compile", () => {
    const hits = rankHits(
      [
        {
          manualId: "tros",
          title: "安装 tros.b",
          url: "https://developer.d-robotics.cc/tros_doc/quick_start/cross_compile",
          kind: "page",
        },
        {
          manualId: "tros",
          title: "安装 tros.b",
          url: "https://developer.d-robotics.cc/tros_doc/quick_start/install_tros",
          kind: "page",
        },
      ],
      "安装 tros",
      5,
    );
    expect(hits[0]?.url).toContain("/install_tros");
  });
});
