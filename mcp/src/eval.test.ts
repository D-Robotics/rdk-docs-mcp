import { describe, expect, it } from "vitest";
import { scoreCase } from "./eval.js";

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
      [{ title: "PoE 供电使用", url: "https://developer.d-robotics.cc/rdk_x_doc/POE", manual: "rdk-x", snippet: "", score: 10 }],
      "# PoE 供电使用\n电压与功率因标准而异",
    );
    expect(score.pass).toBe(true);
  });

  it("fails when search never lands on the expected page", () => {
    const score = scoreCase(
      evalCase,
      [{ title: "配件清单", url: "https://developer.d-robotics.cc/rdk_x_doc/accessory", manual: "rdk-x", snippet: "", score: 3 }],
      "配件",
    );
    expect(score.pass).toBe(false);
    expect(score.searchPass).toBe(false);
  });
});
