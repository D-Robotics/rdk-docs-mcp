import { describe, expect, it } from "vitest";
import { selectSection } from "./sections.js";

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
