import { describe, expect, it } from "vitest";
import { applyOfficialPath, matchOfficialPath } from "./routes.js";
import type { SearchHit } from "./types.js";

describe("matchOfficialPath", () => {
  it("pins Studio S100 flashing when the question is S100 烧录", () => {
    const path = matchOfficialPath("S100 烧录镜像", "s100");
    expect(path?.url).toContain("s100-xburn");
    expect(matchOfficialPath("S100 烧录镜像")?.url).toContain("s100-xburn");
  });

  it("pins X5 system-burn overview for a named X5 burn question", () => {
    expect(matchOfficialPath("烧录", "x5")?.url).toContain("/system-burn/overview");
    expect(matchOfficialPath("flash sd", "x5")?.url).toContain("burn-sd-card");
  });

  it("does not guess a board when 烧录 is unscoped", () => {
    expect(matchOfficialPath("烧录")).toBeUndefined();
  });

  it("does not pin S100 flashing onto a generic XBurn or S600 question", () => {
    expect(matchOfficialPath("XBurn", "xburn")?.id).toBe("xburn-overview");
    expect(matchOfficialPath("烧录", "s600")?.id).toBe("s600-burn");
    expect(matchOfficialPath("烧录", "s600")?.url).not.toContain("s100-xburn");
  });

  it("does not invent a path for an unmapped how-to", () => {
    expect(matchOfficialPath("开机", "s100")).toBeUndefined();
    expect(matchOfficialPath("摄像头", "x5")).toBeUndefined();
    expect(matchOfficialPath("S100 开机上手", "s100")?.url).toContain("/Quick_start/download");
  });

  it("covers the other common how-tos without mixing boards", () => {
    expect(matchOfficialPath("GPIO", "s100")?.url).toContain("driver_gpio_dev");
    expect(matchOfficialPath("GPIO", "s600")?.url).toContain("/s600/gpio");
    expect(matchOfficialPath("WiFi", "s100")?.url).toContain("network_bluetooth");
    expect(matchOfficialPath("S600 烧录")?.url).toContain("rdk_s600/burn");
    expect(matchOfficialPath("miniboot", "x5")?.url).toContain("upgrade-miniboot");
    expect(matchOfficialPath("交叉编译", "tros")?.url).toContain("cross_compile");
    expect(matchOfficialPath("Moss", "studio")?.url).toContain("product-intro/architecture");
    expect(matchOfficialPath("量化", "oe-x5")?.url).toContain("ptq_qat_overview");
    expect(matchOfficialPath("BMI088")?.url).toContain("/introduction");
    expect(matchOfficialPath("风扇", "x5")?.url).toContain("frequency_management");
    expect(matchOfficialPath("电源", "x5")).toBeUndefined();
  });

  it("pins the case handbook for a case survey", () => {
    expect(matchOfficialPath("看下RDK有哪些案例可以参考")?.url).toMatch(/\/case$/);
    expect(matchOfficialPath("应用案例", "case-s600")?.url).toMatch(/\/case$/);
  });

  it("does not pin X5 how-to pages onto an X3-only question", () => {
    expect(matchOfficialPath("RDK X3 是否支持 PoE", "rdk-x")?.url ?? "").not.toMatch(/\/POE$/i);
    expect(matchOfficialPath("RDK X3 的 HDMI 最高分辨率", "rdk-x")?.url ?? "").not.toMatch(/display_rdkx5/);
    expect(matchOfficialPath("RDK X3 Micro SD 卡推荐容量", "rdk-x")?.url ?? "").not.toMatch(/burn-sd-card/);
  });

  it("still pins X5 PoE / HDMI when the question is about X5", () => {
    expect(matchOfficialPath("RDK X5 PoE", "rdk-x")?.url).toMatch(/\/POE$/i);
    expect(matchOfficialPath("RDK X5 HDMI", "rdk-x")?.url).toMatch(/display_rdkx5/);
  });

  it("pins hardware-spec questions to a live page, not an empty shell", () => {
    expect(matchOfficialPath("RDK X5 几路 USB 3.0 Type-A", "rdk-x")?.url)
      .toContain("/hardware_introduction/rdk_x5");
    expect(matchOfficialPath("RDK S600 供电电压范围", "rdk-s")?.url)
      .toContain("01_rdk_s600_kit");
    expect(matchOfficialPath("RDK X3 几路 USB 3.0", "rdk-x")?.url)
      .toMatch(/\/rdk_x_doc\/RDK$/);
    expect(matchOfficialPath("RDK S100 有哪些 USB 接口", "rdk-s")?.url)
      .toMatch(/\/rdk_s_doc\/RDK$/);
  });

  it("does not steal how-tos that already have a better pin", () => {
    expect(matchOfficialPath("RDK X5 USB 摄像头", "rdk-x")?.id).toBe("x5-usb-camera");
    expect(matchOfficialPath("电源", "x5")).toBeUndefined();
  });
});

describe("applyOfficialPath", () => {
  const hit = (title: string, url: string, source: "docs" | "forum" = "docs"): SearchHit => ({
    title,
    url,
    manual: source === "forum" ? "forum" : "rdk-s",
    snippet: "",
    score: 10,
    source,
  });

  it("puts the official start first and labels the rest", () => {
    const path = matchOfficialPath("S100 烧录镜像", "s100");
    const hits = applyOfficialPath(
      [
        hit("S100", "https://developer.d-robotics.cc/rdk_s_doc/audio"),
        hit("社区经验", "https://forum.d-robotics.cc/t/topic/1", "forum"),
      ],
      path,
      5,
    );
    expect(hits[0]?.role).toBe("official-start");
    expect(hits[0]?.url).toContain("s100-xburn");
    expect(hits.some((item) => item.role === "forum-supplement")).toBe(true);
    expect(hits.find((item) => item.url.includes("/audio"))?.role).toBe("related");
  });
});
