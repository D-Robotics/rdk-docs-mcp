import { describe, expect, it } from "vitest";
import { dropDocsForDeadPages, excessivePageDrop, findDeadPageUrls, formatManualDropError, pageUrl, proxyFetchWarning } from "./link-check.js";
import type { IndexedDoc } from "./types.js";

const doc = (url: string, kind: IndexedDoc["kind"]): IndexedDoc => ({
  manualId: "oe-x5",
  title: url,
  url,
  kind,
});

describe("page link check", () => {
  it("keeps the trailing slash and strips the hash and query", () => {
    expect(pageUrl("https://example.test/oe_x5_doc/cn/?x=1#top")).toBe("https://example.test/oe_x5_doc/cn/");
  });

  it("drops a dead page together with its headings", () => {
    const docs = [
      doc("https://example.test/guide/qwen2.5", "page"),
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
      const key = url.replace(/\/+$/, "");
      if (key.endsWith("/gone")) return 404;
      if (key.endsWith("/flaky")) return url.endsWith("/") || n > 1 ? (url.endsWith("/") ? 404 : 200) : 404;
      if (key.endsWith("/slow")) return 0;
      return 200;
    };
    const result = await findDeadPageUrls(
      ["https://example.test/gone", "https://example.test/flaky", "https://example.test/slow", "https://example.test/ok"],
      probe,
    );
    expect(result.dead).toEqual(["https://example.test/gone"]);
    expect(result.unchecked).toEqual(["https://example.test/flaky", "https://example.test/slow"]);
  });

  it("keeps a page when only the no-slash form is a 404", async () => {
    const probe = async (url: string): Promise<number> => (url.endsWith("/cn/") ? 200 : 404);
    const slashed = await findDeadPageUrls(["https://example.test/oe_x5_doc/cn/"], probe);
    const stripped = await findDeadPageUrls(["https://example.test/oe_x5_doc/cn"], probe);
    expect(slashed.dead).toEqual([]);
    expect(stripped.dead).toEqual([]);
  });

  it("fails a build that drops more than 2% of pages and warns when a proxy is set", () => {
    expect(excessivePageDrop(100, 97)).toBe(true);
    expect(excessivePageDrop(1000, 980)).toBe(false);
    const perManual = formatManualDropError([
      { manualId: "small", before: 10, after: 7 },
      { manualId: "large", before: 1000, after: 1000 },
    ]);
    expect(perManual).toMatch(/small: 3 of 10/);
    expect(perManual).not.toMatch(/large/);
    expect(
      formatManualDropError([
        { manualId: "a", before: 1000, after: 980 },
        { manualId: "b", before: 50, after: 49 },
      ]),
    ).toBeUndefined();
    const previous = process.env.HTTPS_PROXY;
    delete process.env.HTTPS_PROXY;
    expect(proxyFetchWarning()).toBeUndefined();
    process.env.HTTPS_PROXY = "http://proxy.example:8080";
    try {
      expect(proxyFetchWarning()).toMatch(/ignores/i);
    } finally {
      if (previous === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = previous;
    }
  });
});
