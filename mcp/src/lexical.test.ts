import { describe, expect, it } from "vitest";
import { fuseRanks, isThinLanding, lexicalScore, lexicalTokens, prepareLexical, structureScale } from "./lexical.js";
import type { IndexedDoc } from "./types.js";

function doc(partial: Partial<IndexedDoc> & Pick<IndexedDoc, "title" | "url">): IndexedDoc {
  return { manualId: "rdk-x", kind: "page", ...partial };
}

describe("lexical title scorer", () => {
  it("drops English function words", () => {
    const tokens = lexicalTokens("how to check the board ip");
    expect(tokens).not.toContain("how");
    expect(tokens).not.toContain("to");
    expect(tokens).not.toContain("check");
    expect(tokens).not.toContain("the");
    expect(tokens).toContain("board");
    expect(tokens).toContain("ip");
  });

  it("ranks a title match above the same words in the body", () => {
    const plan = prepareLexical("烧录");
    const title = lexicalScore(doc({ title: "系统烧录", url: "https://example.test/burn" }), plan);
    const body = lexicalScore(
      doc({ title: "其他说明", url: "https://example.test/other", text: "烧录 烧录 烧录" }),
      plan,
    );
    expect(title).toBeGreaterThan(body);
  });

  it("fuses reciprocal ranks without letting the title channel outvote BM25's top hit", () => {
    expect(fuseRanks(0, 0)).toBeGreaterThan(fuseRanks(0, 1));
    expect(fuseRanks(0, 0)).toBeGreaterThan(fuseRanks(1, 0));
    expect(fuseRanks(0, 5)).toBeGreaterThan(fuseRanks(1, 0));
    expect(fuseRanks(0, 0)).toBeCloseTo(1 / 10 + 0.22 / 10);
  });

  it("down-weights a short landing label and boosts a stepped guide", () => {
    const landing = doc({ title: "X5", url: "https://example.test/home" });
    const guide = doc({
      title: "烧录指南",
      url: "https://example.test/start/burn",
      text: "1. 写入镜像\n2. 校验\n`dd if=image`",
    });
    expect(isThinLanding(landing)).toBe(true);
    expect(isThinLanding(guide)).toBe(false);
    expect(structureScale(guide)).toBeGreaterThan(structureScale(landing));
    expect(structureScale(landing)).toBe(1);
  });
});
