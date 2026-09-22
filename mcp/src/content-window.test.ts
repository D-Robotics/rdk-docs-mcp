import { describe, expect, it } from "vitest";
import { sliceContent } from "./content-window.js";

describe("sliceContent", () => {
  it("reassembles bounded content using a stable hash", () => {
    const first = sliceContent("abcdef", { maxChars: 3 });
    const second = sliceContent("abcdef", {
      offset: first.next_offset ?? 0,
      maxChars: 3,
      expectedContentHash: first.content_hash,
    });

    expect(first).toMatchObject({
      text: "abc",
      offset: 0,
      next_offset: 3,
      total_chars: 6,
      truncated: true,
    });
    expect(second).toMatchObject({
      text: "def",
      offset: 3,
      next_offset: null,
      total_chars: 6,
      content_hash: first.content_hash,
      truncated: false,
    });
  });

  it("rejects a continuation when the content changed", () => {
    const first = sliceContent("abcdef", { maxChars: 3 });
    expect(() =>
      sliceContent("changed", {
        offset: 3,
        maxChars: 3,
        expectedContentHash: first.content_hash,
      }),
    ).toThrow(/content.*changed/i);
  });

  it("requires the first window hash for a continuation", () => {
    expect(() => sliceContent("abcdef", { offset: 3, maxChars: 3 })).toThrow(
      /expectedContentHash.*required/i,
    );
  });
});
