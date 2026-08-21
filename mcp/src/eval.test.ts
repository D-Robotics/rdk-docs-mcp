import { describe, expect, it } from "vitest";
import { scoreCase, scoreDocsFirstMix, scoreForumToc } from "./eval.js";

const evalCase = {
  id: "x5-poe",
  question: "PoE?",
  query: "PoE",
  urlMustInclude: ["/POE"],
  pageMustInclude: ["PoE"],
};

describe("scoreCase", () => {
  it("passes when a top hit URL matches and the page contains the fact", () => {
    const score = scoreCase(
      evalCase,
      [{ title: "PoE 供电使用", url: "https://developer.d-robotics.cc/rdk_x_doc/POE", manual: "rdk-x", snippet: "", score: 10, source: "docs" }],
      "# PoE 供电使用\n电压与功率因标准而异",
    );
    expect(score.pass).toBe(true);
  });

  it("fails when the first hit is not the official how-to page", () => {
    const score = scoreCase(
      { ...evalCase, firstHitMustInclude: ["/POE"] },
      [
        { title: "配件清单", url: "https://developer.d-robotics.cc/rdk_x_doc/accessory", manual: "rdk-x", snippet: "", score: 3, source: "docs" },
        { title: "PoE 供电使用", url: "https://developer.d-robotics.cc/rdk_x_doc/POE", manual: "rdk-x", snippet: "", score: 2, source: "docs" },
      ],
      "# PoE 供电使用",
    );
    expect(score.pass).toBe(false);
    expect(score.reason).toMatch(/first hit/);
  });

  it("fails when search never lands on the expected page", () => {
    const score = scoreCase(
      evalCase,
      [{ title: "配件清单", url: "https://developer.d-robotics.cc/rdk_x_doc/accessory", manual: "rdk-x", snippet: "", score: 3, source: "docs" }],
      "配件",
    );
    expect(score.pass).toBe(false);
    expect(score.searchPass).toBe(false);
  });
});

describe("scoreForumToc", () => {
  it("requires recent topics from both primary boards", () => {
    const score = scoreForumToc([
      { title: "yolo模型量化精度问题", url: "https://forum.d-robotics.cc/t/topic/35610", breadcrumbs: ["开发与问题"] },
      { title: "S100连接摄像头稳定掉线", url: "https://forum.d-robotics.cc/t/topic/35500", breadcrumbs: ["通用"] },
    ]);
    expect(score.pass).toBe(false);
    expect(score.reason).toMatch(/too few/);
  });

  it("passes a two-board latest list of topic URLs", () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      title: `topic ${index}`,
      url: `https://forum.d-robotics.cc/t/topic/${100 + index}`,
      breadcrumbs: [index < 6 ? "开发与问题" : "通用"],
    }));
    const score = scoreForumToc(pages);
    expect(score.pass).toBe(true);
    expect(score.boards).toEqual(["开发与问题", "通用"]);
  });
});

describe("scoreDocsFirstMix", () => {
  const hit = (source: "docs" | "forum", title: string): Parameters<typeof scoreDocsFirstMix>[0][number] => ({
    title,
    url: `https://example.test/${title}`,
    manual: source === "forum" ? "forum" : "rdk-x",
    snippet: "",
    score: 1,
    source,
  });

  it("requires official docs first and in the majority", () => {
    const score = scoreDocsFirstMix(
      [hit("docs", "a"), hit("docs", "b"), hit("docs", "c"), hit("forum", "d")],
      8,
    );
    expect(score.pass).toBe(true);
  });

  it("fails when forum crowds the first slot or takes too many", () => {
    expect(scoreDocsFirstMix([hit("forum", "a"), hit("docs", "b")], 8).pass).toBe(false);
    expect(
      scoreDocsFirstMix(
        [hit("docs", "a"), hit("forum", "b"), hit("forum", "c"), hit("forum", "d")],
        8,
      ).pass,
    ).toBe(false);
  });
});
