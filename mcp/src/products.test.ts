import { describe, expect, it } from "vitest";
import { mentionedBoards, soleBoard, urlLooksLikeBoard } from "./products.js";

describe("mentionedBoards", () => {
  it("reads explicit board names and treats Module / S100P as the family", () => {
    expect(mentionedBoards("RDK X3 是否支持 PoE")).toEqual(["x3"]);
    expect(mentionedBoards("RDK X3 Module 调试串口")).toEqual(["x3"]);
    expect(mentionedBoards("RDK X5 几路 USB")).toEqual(["x5"]);
    expect(mentionedBoards("S100P 算力")).toEqual(["s100"]);
    expect(mentionedBoards("S600 供电")).toEqual(["s600"]);
  });

  it("keeps both boards when the question compares them", () => {
    expect(mentionedBoards("X3 和 X5 的 USB 有何不同").sort()).toEqual(["x3", "x5"]);
    expect(soleBoard("X3 和 X5 的 USB 有何不同")).toBeUndefined();
  });

  it("returns empty when no board is named", () => {
    expect(mentionedBoards("如何烧录")).toEqual([]);
    expect(soleBoard("如何烧录")).toBeUndefined();
  });

  it("reads a board id glued with an underscore", () => {
    expect(mentionedBoards("rdk_x3 module")).toEqual(["x3"]);
    expect(mentionedBoards("driver_development_x5")).toEqual(["x5"]);
    expect(urlLooksLikeBoard("/rdk_x_doc/linux_development/driver_development_x5/gpio", "x5")).toBe(true);
    expect(urlLooksLikeBoard("/rdk_x_doc/linux_development/driver_development_x5/gpio", "x3")).toBe(false);
  });

  it("does not treat incidental x/5 or s100 prefixes as a board", () => {
    expect(mentionedBoards("max 5V")).toEqual([]);
    expect(mentionedBoards("index 5 HDMI")).toEqual([]);
    expect(mentionedBoards("appendix 5")).toEqual([]);
    expect(mentionedBoards("X 3.3V")).toEqual([]);
    expect(mentionedBoards("s1000 算力")).toEqual([]);
    expect(mentionedBoards("as100")).toEqual([]);
    expect(mentionedBoards("ks100")).toEqual([]);
    expect(soleBoard("RDK X5 几路 USB")).toBe("x5");
  });

  it("reads board names glued to the brand or to a short suffix", () => {
    expect(mentionedBoards("RDKS100 说明书")).toEqual(["s100"]);
    expect(mentionedBoards("rdks100p 规格")).toEqual(["s100"]);
    expect(mentionedBoards("RDK-S600 供电")).toEqual(["s600"]);
    expect(mentionedBoards("RDKX5 引脚")).toEqual(["x5"]);
    expect(mentionedBoards("RDKX3 引脚")).toEqual(["x3"]);
    expect(mentionedBoards("x3m 模组")).toEqual(["x3"]);
    expect(mentionedBoards("旭日3派")).toEqual(["x3"]);
    expect(mentionedBoards("x5、s100 的 USB").sort()).toEqual(["s100", "x5"]);
    expect(soleBoard("RDKS100")).toBe("s100");
  });

  it("rolls glued-name recognition back with RDK_ABLATE=board_glued", () => {
    const previous = process.env.RDK_ABLATE;
    process.env.RDK_ABLATE = "board_glued";
    try {
      expect(mentionedBoards("RDKS100")).toEqual([]);
      expect(mentionedBoards("RDK X5")).toEqual(["x5"]);
      expect(mentionedBoards("s1000")).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.RDK_ABLATE;
      else process.env.RDK_ABLATE = previous;
    }
  });
});

describe("urlLooksLikeBoard", () => {
  it("treats RDK X3 in a title as x3 without mistaking rdk_x5", () => {
    expect(urlLooksLikeBoard("Q18: RDK X3 不同系统版本的有线网口的 IP 是什么？", "x3")).toBe(true);
    expect(urlLooksLikeBoard("1.1.2 硬件简介", "x3")).toBe(false);
    expect(
      urlLooksLikeBoard(
        "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5",
        "x3",
      ),
    ).toBe(false);
    expect(
      urlLooksLikeBoard(
        "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5",
        "x5",
      ),
    ).toBe(true);
    expect(urlLooksLikeBoard("RDK X5 HDMI", "x5")).toBe(true);
    expect(urlLooksLikeBoard("RDK X5 HDMI", "x3")).toBe(false);
  });
});
