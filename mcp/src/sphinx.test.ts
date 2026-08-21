import { describe, expect, it } from "vitest";
import { compactSphinxIndex } from "./sphinx.js";

describe("compactSphinxIndex", () => {
  it("parses quoted JSON Search.setIndex used by X5 SDK", () => {
    const source = `Search.setIndex({"docnames":["index","linux_development/board_bring_up"],"titles":{"index":"X5 SDK","linux_development/board_bring_up":"Board bring up"}});`;
    const docs = compactSphinxIndex(source, "x5-sdk", "/x5_sdk_doc");
    expect(docs.find((d) => d.title === "Board bring up")?.url).toContain(
      "/x5_sdk_doc/linux_development/board_bring_up.html",
    );
  });

  it("parses unquoted JS object literal used by OE X5", () => {
    const source = `Search.setIndex({docnames:["index","oe_mapper/source/ptq"],titles:["X5 \\u7b97\\u6cd5\\u5de5\\u5177\\u94fe","<span class=\\"section-number\\">4. </span>PTQ \\u91cf\\u5316"]});`;
    const docs = compactSphinxIndex(source, "oe-x5", "/oe_x5_doc/cn");
    expect(docs.map((d) => d.title)).toEqual(
      expect.arrayContaining(["X5 算法工具链"]),
    );
    expect(docs.some((d) => d.title.includes("量化"))).toBe(true);
    expect(docs.find((d) => d.title.includes("量化"))?.url).toContain(
      "/oe_x5_doc/cn/oe_mapper/source/ptq.html",
    );
  });
});
