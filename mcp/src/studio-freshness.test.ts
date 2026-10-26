import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const windowMs = 15 * 60 * 1000;
const index = (title: string) => JSON.stringify([{ documents: [{
  t: title, u: "/rdk_studio_doc/user-guide/new-guide", b: ["RDK Studio"],
}] }]);
let cache: string;
let request: ReturnType<typeof vi.fn>;
let service: typeof import("./service.js");
let http: typeof import("./http.js");

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The bundled snapshot was built on October 10 and is deliberately fresh here.
  vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
  cache = await mkdtemp(join(tmpdir(), "rdk-studio-freshness-"));
  vi.stubEnv("RDK_DOCS_CACHE_DIR", cache);
  vi.stubEnv("RDK_DOCS_OFFLINE", "0");
  vi.stubEnv("RDK_DOCS_PREBUILT", "1");
  vi.stubEnv("RDK_DOCS_CACHE_TTL_MS", String(24 * 60 * 60 * 1000));
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  service = await import("./service.js");
  http = await import("./http.js");
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(cache, { recursive: true, force: true });
});
const response = (body: string) => new Response(body, { status: 200 });
const lookup = (query: string) => service.searchDocs({ query, manual: "studio", limit: 2 }, http.fetchText);
const firstTitle = (result: Awaited<ReturnType<typeof lookup>>) => result.hits[0]?.title;

describe("Studio manual freshness", () => {
  it("uses the published index even when its packaged snapshot is fresh", async () => {
    request.mockImplementation(async () => response(index("PublishedMarker Studio guide")));
    expect(firstTitle(await lookup("PublishedMarker"))).toContain("PublishedMarker");
    expect(request).toHaveBeenCalledOnce();
  });
  it("refreshes memory and disk data after 15 minutes", async () => {
    request.mockImplementation(async () => response(index(request.mock.calls.length === 1 ? "FirstMarker" : "SecondMarker")));
    expect(firstTitle(await lookup("FirstMarker"))).toBe("FirstMarker");
    vi.setSystemTime(Date.now() + windowMs - 1);
    expect(firstTitle(await lookup("FirstMarker"))).toBe("FirstMarker");
    expect(request).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 2);
    // A new process must not keep an expired owner's on-disk HTTP cache.
    vi.resetModules();
    service = await import("./service.js");
    http = await import("./http.js");
    expect(firstTitle(await lookup("SecondMarker"))).toBe("SecondMarker");
    expect(request).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + windowMs + 1);
    request.mockImplementation(async () => response(index("ThirdMarker")));
    expect(firstTitle(await lookup("ThirdMarker"))).toBe("ThirdMarker");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("honors a shorter configured lifetime", async () => {
    vi.stubEnv("RDK_DOCS_CACHE_TTL_MS", "1000");
    request.mockImplementation(async () => response(index(request.mock.calls.length === 1 ? "FirstMarker" : "SecondMarker")));
    expect(firstTitle(await lookup("FirstMarker"))).toBe("FirstMarker");
    vi.setSystemTime(Date.now() + 1001);
    expect(firstTitle(await lookup("SecondMarker"))).toBe("SecondMarker");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each(["{bad json", "[]", "{}", '[{"documents":[{"t":"broken","u":123}]}]',
    '[{"documents":[{"t":"Foreign origin","u":"https://example.com/somewhere"}]}]',
    '[{"documents":[{"t":"Foreign manual","u":"/rdk_x_doc/somewhere"}]}]'])
    ("retains prior data and cached fallback warnings after invalid refresh: %s", async (bad) => {
      request.mockResolvedValueOnce(response(index("RetainedMarker")));
      expect(firstTitle(await lookup("RetainedMarker"))).toBe("RetainedMarker");
      vi.setSystemTime(Date.now() + windowMs + 1);
      request.mockImplementation(async () => response(bad));
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await lookup("RetainedMarker");
        expect(firstTitle(result)).toBe("RetainedMarker");
        expect(result.warnings.join(" ")).toMatch(/fallback|stale/i);
      }
      expect(request).toHaveBeenCalledTimes(2);
    });
  it("falls back to the packaged index on failure and warns every time", async () => {
    request.mockRejectedValue(new Error("network unavailable"));
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await lookup("Moss");
      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.warnings.join(" ")).toMatch(/packaged|snapshot/i);
      expect(result.warnings.join(" ")).toMatch(/fallback|stale/i);
    }
    expect(request).toHaveBeenCalledOnce();
  });
  it("does no network access offline and keeps its fallback warning", async () => {
    vi.stubEnv("RDK_DOCS_OFFLINE", "1");
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await lookup("Moss");
      expect(result.hits.length).toBeGreaterThan(0);
      expect(result.warnings.join(" ")).toMatch(/fallback|stale/i);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("also reports fallback state when listing the Studio contents", async () => {
    vi.stubEnv("RDK_DOCS_OFFLINE", "1");
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await service.listToc({ manual: "studio" }, http.fetchText);
      expect(result.pages.length).toBeGreaterThan(0);
      expect(result.warnings?.join(" ")).toMatch(/fallback|stale/i);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("keeps fallback warnings local to concurrent searches and contents requests", async () => {
    vi.stubEnv("RDK_DOCS_OFFLINE", "1");
    await lookup("Moss");
    const toc = () => service.listToc({ manual: "studio" }, http.fetchText);
    for (const pending of [[lookup("Moss"), lookup("Moss")], [toc(), toc()], [lookup("Moss"), toc()]]) {
      const results = await Promise.all(pending);
      for (const result of results) expect(result.warnings?.join(" ")).toMatch(/fallback|stale/i);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves another manual's packaged-first behavior", async () => {
    const result = await service.searchDocs({ query: "GPIO", manual: "rdk-x", limit: 2 }, http.fetchText);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });
  it("does not compound disk and memory freshness windows", async () => {
    request.mockImplementation(async () => response(index(request.mock.calls.length === 1 ? "FirstMarker" : "SecondMarker")));
    expect(firstTitle(await lookup("FirstMarker"))).toBe("FirstMarker");
    vi.setSystemTime(Date.now() + windowMs - 60_000);
    vi.resetModules();
    service = await import("./service.js");
    http = await import("./http.js");
    expect(firstTitle(await lookup("FirstMarker"))).toBe("FirstMarker");
    expect(request).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 60_001);
    expect(firstTitle(await lookup("SecondMarker"))).toBe("SecondMarker");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("keeps the valid disk index after a bad refresh in a cold process", async () => {
    request.mockResolvedValueOnce(response(index("RetainedMarker")));
    expect(firstTitle(await lookup("RetainedMarker"))).toBe("RetainedMarker");
    vi.setSystemTime(Date.now() + windowMs + 1);
    request.mockImplementation(async () => response("[]"));
    vi.resetModules();
    service = await import("./service.js");
    http = await import("./http.js");
    const result = await lookup("RetainedMarker");
    expect(firstTitle(result)).toBe("RetainedMarker");
    expect(result.warnings.join(" ")).toMatch(/previously fetched index/);
    vi.resetModules();
    service = await import("./service.js");
    http = await import("./http.js");
    const cold = await lookup("RetainedMarker");
    expect(firstTitle(cold)).toBe("RetainedMarker");
    expect(cold.warnings.join(" ")).toMatch(/fallback|stale/i);
  });
  it("reads a real custom HTML anchor after a long preamble", async () => {
    const url = "https://developer.d-robotics.cc/rdk_studio_doc/user-guide/new-guide#custom-real-id";
    const html = `<article><h1>Guide</h1><p>${"unrelated preamble ".repeat(800)}</p><h2 id="custom-real-id">New section</h2><p>ExactNewSectionMarker</p><h2 id="later">Later</h2><p>Other text</p></article>`;
    const page = await service.getPage({ url }, async () => html);
    expect(page.sectionMatched).toBe(true);
    expect(page.anchor).toBe("custom-real-id");
    expect(page.markdown).toContain("ExactNewSectionMarker");
    expect(page.markdown).not.toContain("unrelated preamble");
  });
  it("refreshes Studio page bodies on the same HTTP window", async () => {
    const url = "https://developer.d-robotics.cc/rdk_studio_doc/user-guide/new-guide";
    request.mockImplementation(async () => response(`<article><h1>Guide</h1><p>${request.mock.calls.length === 1 ? "FirstBody" : "SecondBody"}</p></article>`));
    expect((await service.getPage({ url, full: true }, http.fetchText)).markdown).toContain("FirstBody");
    vi.setSystemTime(Date.now() + windowMs + 1);
    expect((await service.getPage({ url, full: true }, http.fetchText)).markdown).toContain("SecondBody");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
