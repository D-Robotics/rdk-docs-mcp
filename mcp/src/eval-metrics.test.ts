import { describe, expect, it } from "vitest";
import { rankOf, scoreRetrievalCase, summarize } from "./eval-metrics.js";

describe("retrieval metrics", () => {
  const hits = [
    { url: "https://example.test/network", title: "网络" },
    { url: "https://example.test/hardware_introduction/rdk_x5", title: "X5" },
    { url: "https://example.test/hardware_introduction/rdk_x3", title: "X3" },
  ];

  it("ranks the first URL that contains any expected fragment", () => {
    expect(rankOf(hits, ["rdk_x5"])).toBe(2);
    expect(rankOf(hits, ["missing"])).toBeNull();
  });

  it("counts a no-good-match signal as a hit and a silent miss as a failure", () => {
    const missed = scoreRetrievalCase({ id: "sun", query: "sun55iw3", expectNoGoodMatch: true }, [], false, 4);
    const found = scoreRetrievalCase({ id: "sun", query: "sun55iw3", expectNoGoodMatch: true }, [], true, 4);
    expect(missed.hitAt1).toBe(false);
    expect(found.hitAt1).toBe(true);
    expect(found.reciprocalRank).toBe(1);
  });

  it("summarizes hit@1, hit@3, and MRR", () => {
    const summary = summarize([
      scoreRetrievalCase({ id: "a", query: "a", expectUrlIncludes: ["rdk_x5"] }, hits, false, 10),
      scoreRetrievalCase({ id: "b", query: "b", expectUrlIncludes: ["missing"] }, hits, false, 30),
    ]);
    expect(summary.n).toBe(2);
    expect(summary.hitAt1).toBe(0);
    expect(summary.hitAt3).toBe(0.5);
    expect(summary.mrr).toBeCloseTo(0.25);
    expect(summary.meanMs).toBe(20);
  });
});
