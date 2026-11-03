import { describe, expect, it } from "vitest";
import { dropDocsForDeadPages, excessivePageDrop, findDeadPageUrls, formatManualDropError, linkCheckDropCounts, pageUrl, proxyFetchWarning } from "./link-check.js";
import type { IndexedDoc } from "./types.js";

const doc = (url: string, kind: IndexedDoc["kind"]): IndexedDoc => ({
  manualId: "oe-x5",
  title: url,
  url,
  kind,
});

describe("page link check", () => {
  it("limits default probe concurrency while checking every page", async () => {
    const urls = Array.from({ length: 33 }, (_, i) => `https://example.test/page-${i}`);
    const visited: string[] = [];
    let active = 0;
    let peak = 0;
    const result = await findDeadPageUrls(urls, async (url) => {
      visited.push(url);
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active -= 1;
      return 200;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(visited.sort()).toEqual([...urls].sort());
    expect(result).toEqual({ dead: [], unchecked: [] });
  });

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

  it("does not count a dead URL the previous snapshot already omitted", () => {
    const prior = new Set(["https://example.test/keep", "https://example.test/also"]);
    const loaded = ["https://example.test/keep", "https://example.test/also", "https://example.test/guide/qwen2.5"];
    const kept = ["https://example.test/keep", "https://example.test/also"];
    expect(linkCheckDropCounts(prior, loaded, kept)).toEqual({ before: 2, after: 2 });
    expect(linkCheckDropCounts(prior, loaded, ["https://example.test/keep"])).toEqual({ before: 2, after: 1 });
    expect(linkCheckDropCounts(undefined, loaded, kept)).toEqual({ before: 3, after: 2 });
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
    const proxyKeys = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy"] as const;
    const previous = Object.fromEntries(proxyKeys.map((key) => [key, process.env[key]]));
    try {
      for (const key of proxyKeys) delete process.env[key];
      expect(proxyFetchWarning()).toBeUndefined();
      process.env.HTTP_PROXY = "http://proxy.example:8080";
      expect(proxyFetchWarning()).toMatch(/ignores/i);
      delete process.env.HTTP_PROXY;
      process.env.all_proxy = "http://proxy.example:8080";
      expect(proxyFetchWarning()).toMatch(/ignores/i);
    } finally {
      for (const key of proxyKeys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
