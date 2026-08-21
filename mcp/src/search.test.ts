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

  it("finds Chinese queries such as 烧录", () => {
    const hits = rankHits(docs, "烧录", 5);
    expect(hits[0]?.title).toBe("系统烧录");
  });
});
