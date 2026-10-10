import { describe, expect, it } from "vitest";
import { packRelevantSections, selectSection } from "./sections.js";

const faq = `# 常见问题

### Q1: 开机黑屏怎么办？

先看供电。

### Q10: \`apt update\` 命令执行失败或报错如何处理？

前面是别的报错。

1. 软件源域名变更或 GPG 密钥问题[](https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system#1-软件源域名变更或-gpg-密钥问题)

检查 \`/etc/apt/sources.list.d/sunrise.list\`。

### Q11: 别的问题

与软件源无关。
`;

const pins = `# 管脚定义与应用

## 管脚复用关系配置

| 接口功能 1 | 接口功能 2 |
| --- | --- |
| uart3 | i2c5 |

## 40PIN 管脚定义[](https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/01_40pin_user_sample/40pin_define#40pin_define)

开发板提供 40PIN 标准接口，接口定义如下：

**RDK X5**

![x5 pin map](https://example.test/x5-pin.png)

## GPIO 读写操作示例

运行示例。
`;

describe("selectSection", () => {
  it("returns the apt-source section instead of the start of a long FAQ", () => {
    const picked = selectSection(faq, { query: "apt 软件源" });
    expect(picked.matched).toBe(true);
    expect(picked.markdown).toContain("sources.list");
    expect(picked.markdown).toContain("软件源");
    expect(picked.markdown.startsWith("# 常见问题")).toBe(false);
  });

  it("honors a URL anchor past the first 2500 characters", () => {
    const padded = `${"前言 ".repeat(800)}\n${faq}`;
    expect(padded.indexOf("sources.list")).toBeGreaterThan(2500);
    const picked = selectSection(padded, { anchor: "1-软件源域名变更或-gpg-密钥问题" });
    expect(picked.matched).toBe(true);
    expect(picked.markdown).toContain("sources.list");
    expect(picked.markdown.slice(0, 2500)).toContain("软件源");
  });

  it("does not match an anchor against a code comment or a body link to the page", () => {
    const page = `# 8.1 硬件、系统与环境配置

\`\`\`
deb [signed-by=/usr/share/keyrings/sunrise.gpg] http://archive.d-robotics.cc/ubuntu-rdk-s100 jammy main #RDK S100
\`\`\`

### Q11: 如何查看 RDK X3 的 CPU、BPU 等硬件单元的运行状态?[](https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system#q11-如何查看-rdk-x3-的-cpubpu-等硬件单元的运行状态)

使用 hrut_somstatus。
`;
    const picked = selectSection(page, { anchor: "q11-%E5%A6%82%E4%BD%95%E6%9F%A5%E7%9C%8B-rdk-x3-%E7%9A%84-cpubpu-%E7%AD%89%E7%A1%AC%E4%BB%B6%E5%8D%95%E5%85%83%E7%9A%84%E8%BF%90%E8%A1%8C%E7%8A%B6%E6%80%81" });
    expect(picked.matched).toBe(true);
    expect(picked.markdown).toContain("hrut_somstatus");
    expect(picked.section).toContain("Q11");

    const pageAnchor = selectSection(`# 管脚定义与应用\n\n## 硬件使用说明[](https://x.test/40pin_define#硬件使用说明)\n\n电平。\n\n## 40PIN 管脚定义[](https://x.test/40pin_define#40pin-管脚定义)\n\n表。\n`, { anchor: "40pin_define" });
    expect(pageAnchor.section ?? "").not.toContain("硬件使用说明");

    const rspress = selectSection(`前言\n\n环境准备 #\n\n装依赖。\n\n模型量化 #\n\n若您通过 resolve_model.txt 获取模型，则可跳过此模型量化步骤。\n`, { anchor: "模型量化" });
    expect(rspress.matched).toBe(true);
    expect(rspress.section).toBe("模型量化 #");
  });

  it("flags an image-only pin map and names the picture", () => {
    const picked = selectSection(pins, { section: "40PIN 管脚定义" });
    expect(picked.matched).toBe(true);
    expect(picked.imageOnly).toBe(true);
    expect(picked.markdown).toContain("只在图片里");
    expect(picked.markdown).toContain("https://example.test/x5-pin.png");
    expect(picked.markdown).not.toContain("uart3");
  });
});

describe("packRelevantSections", () => {
  const pageUrl = "https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system";
  const section = (title: string, body: string) => `## ${title}\n\n${body}`;
  const long = [
    section("开头", "甲".repeat(2500)),
    section("接口", "乙".repeat(2500)),
    section("网络", "丙".repeat(2500)),
    section("烧录准备", "烧录镜像前先检查 SD 卡。"),
    section("烧录步骤", `烧录镜像的命令如下。${"丁".repeat(200)}`),
    section("适配器", "设备供电需要 5V 适配器。"),
    section("结尾", "戊".repeat(2500)),
  ].join("\n\n");

  it("keeps leading sections under the cap and names the page", () => {
    const packed = packRelevantSections(long, { pageUrl, maxChars: 6000 });
    expect(packed.markdown.startsWith(`Source: ${pageUrl}`)).toBe(true);
    expect(packed.markdown.length).toBeLessThanOrEqual(6000);
    expect(packed.markdown).toContain("## 开头");
    expect(packed.markdown).not.toContain("烧录镜像");
    expect(packed.truncated).toBe(true);
    expect(packed.markdown).toContain("… omitted sections:");
    expect(packed.markdown).toContain("烧录准备");
    expect(packed.markdown).not.toContain("…[truncated]");
  });

  it("returns matching sections in document order, not the page start", () => {
    const packed = packRelevantSections(long, { pageUrl, query: "烧录镜像", maxChars: 6000 });
    expect(packed.matched).toBe(true);
    expect(packed.markdown).toContain("## 烧录准备");
    expect(packed.markdown).toContain("## 烧录步骤");
    expect(packed.markdown.indexOf("烧录准备")).toBeLessThan(packed.markdown.indexOf("烧录步骤"));
    expect(packed.markdown).not.toContain("甲".repeat(20));
    expect(packed.markdown.length).toBeLessThanOrEqual(6000);
    expect(packed.section).toBe("烧录准备");
    expect(packed.markdown).toContain("… omitted sections:");
  });

  it("stays within an explicit maxChars below the default cap", () => {
    const packed = packRelevantSections(long, { pageUrl, maxChars: 4000 });
    expect(packed.markdown.length).toBeLessThanOrEqual(4000);
  });

  it("honors an explicit maxChars above 6000", () => {
    const packed = packRelevantSections(long, { pageUrl, maxChars: 20000 });
    expect(packed.markdown.length).toBeGreaterThan(6000);
    expect(packed.markdown.length).toBeLessThanOrEqual(20000);
    expect(packed.markdown).toContain("烧录镜像");
  });

  it("ranks the page's own sections with BM25 when the query matches none directly", () => {
    const packed = packRelevantSections(long, { pageUrl, query: "供电", maxChars: 6000 });
    expect(packed.matched).toBe(true);
    expect(packed.section).toBe("适配器");
    expect(packed.markdown).toContain("5V 适配器");
    expect(packed.markdown).not.toContain("甲".repeat(20));
    expect(packed.markdown).toContain("… omitted sections:");
  });

  it("returns a heading index when BM25 also matches nothing", () => {
    const packed = packRelevantSections(long, { pageUrl, query: "量子纠缠", maxChars: 6000 });
    expect(packed.matched).toBe(false);
    expect(packed.markdown).toContain("Section index:");
    expect(packed.markdown).toContain("- 适配器");
    expect(packed.markdown).toContain("- 烧录准备");
    expect(packed.markdown).not.toContain("甲".repeat(20));
    expect(packed.markdown).not.toContain("烧录镜像");
  });

  it("keeps the body budget when a page has many omitted sections", () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      section(`章节${String(index).padStart(3, "0")} ${"标题".repeat(6)}`, "甲".repeat(180)),
    ).join("\n\n");
    const packed = packRelevantSections(many, { pageUrl, maxChars: 6000 });
    const at = packed.markdown.indexOf("… omitted sections:");
    expect(at).toBeGreaterThan(5000);
    const marker = packed.markdown.slice(at);
    expect(marker.length).toBeLessThanOrEqual(800);
    expect(marker).toMatch(/…and \d+ more/);
    expect(packed.markdown.slice(0, at)).toContain("## 章节000");
    expect(packed.markdown.slice(0, at)).not.toContain("## 章节070");
  });
});
