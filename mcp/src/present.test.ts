import { describe, expect, it } from "vitest";
import { COMPACT_RESULT_CHARS, compactSearchResult } from "./present.js";
import type { SearchHit } from "./types.js";

function hit(index: number): SearchHit {
  return {
    title: `章节 ${index}`,
    url: `https://developer.d-robotics.cc/rdk_x_doc/FAQ/hardware_and_system#q${index}-很长的锚点标题`,
    manual: "rdk-x",
    snippet: "甲".repeat(800),
    score: 10 - index,
    source: "docs",
    coverage: 1,
    confidence: 0.9,
    board: "x5",
  };
}

describe("compactSearchResult", () => {
  it("keeps title, page url, anchor, and a short snippet inside the default budget", () => {
    const compact = compactSearchResult(
      {
        hits: [0, 1, 2, 3, 4].map(hit),
        ambiguousBoard: false,
        noGoodMatch: false,
        warnings: [],
      },
      { capChars: COMPACT_RESULT_CHARS },
    );
    expect(compact.hits).toHaveLength(5);
    expect(compact.hits[0]?.url).not.toContain("#");
    expect(compact.hits[0]?.anchor).toContain("q0");
    expect(compact.hits[0]?.snippet.length).toBeLessThanOrEqual(200);
    expect(compact.hits[0]).not.toHaveProperty("score");
    expect(JSON.stringify(compact, null, 2).length).toBeLessThanOrEqual(COMPACT_RESULT_CHARS);
    expect(compact.guidance).toMatch(/1–2/);
  });
});
