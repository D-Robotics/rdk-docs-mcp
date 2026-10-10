import { describe, expect, it } from "vitest";
import { dropDocsForDeadPages, findDeadPageUrls, pageUrl } from "./link-check.js";
import type { IndexedDoc } from "./types.js";

const doc = (url: string, kind: IndexedDoc["kind"]): IndexedDoc => ({
  manualId: "oe-x5",
  title: url,
  url,
  kind,
});

describe("page link check", () => {
  it("strips the hash, query, and trailing slash", () => {
    expect(pageUrl("https://example.test/oe_x5_doc/cn/?x=1#top")).toBe("https://example.test/oe_x5_doc/cn");
  });

  it("drops a dead page together with its headings", () => {
    const docs = [
      doc("https://example.test/guide/qwen2.5/", "page"),
      doc("https://example.test/guide/qwen2.5#测试条件", "heading"),
      doc("https://example.test/guide/keep", "page"),
    ];
    const kept = dropDocsForDeadPages(docs, new Set(["https://example.test/guide/qwen2.5"]));
    expect(kept.map((item) => item.url)).toEqual(["https://example.test/guide/keep"]);
  });

  it("confirms 404 twice and keeps a page that only failed once", async () => {
    const seen = new Map<string, number>();
    const probe = async (url: string): Promise<number> => {
      const n = (seen.get(url) ?? 0) + 1;
      seen.set(url, n);
      if (url.endsWith("/gone")) return 404;
      if (url.endsWith("/flaky")) return n === 1 ? 404 : 200;
      if (url.endsWith("/slow")) return 0;
      return 200;
    };
    const result = await findDeadPageUrls(
      ["https://example.test/gone", "https://example.test/flaky", "https://example.test/slow", "https://example.test/ok"],
      probe,
    );
    expect(result.dead).toEqual(["https://example.test/gone"]);
    expect(result.unchecked).toEqual(["https://example.test/flaky", "https://example.test/slow"]);
  });
});
