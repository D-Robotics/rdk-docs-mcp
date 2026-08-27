import { describe, expect, it } from "vitest";
import { mentionedBoards, soleBoard } from "./products.js";

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
});
