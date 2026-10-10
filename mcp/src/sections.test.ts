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
    section("结尾", "戊".repeat(2500)),
  ].join("\n\n");

  it("keeps leading sections under the cap and names the page", () => {
    const packed = packRelevantSections(long, { pageUrl, maxChars: 6000 });
    expect(packed.markdown.startsWith(`Source: ${pageUrl}`)).toBe(true);
    expect(packed.markdown.length).toBeLessThanOrEqual(6000);
    expect(packed.markdown).toContain("## 开头");
    expect(packed.markdown).not.toContain("烧录镜像");
    expect(packed.truncated).toBe(true);
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
  });

  it("does not grow past the cap when the caller asks for 40000 characters", () => {
    const packed = packRelevantSections(long, { pageUrl, maxChars: 4000 });
    expect(packed.markdown.length).toBeLessThanOrEqual(4000);
  });
});
