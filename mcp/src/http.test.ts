import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchText } from "./http.js";

const tempPaths: string[] = [];

function tempPath(prefix = "rdk-http-"): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  tempPaths.push(path);
  return path;
}

function response(body: string): Response {
  return new Response(body, { status: 200 });
}

/** 把唯一那条缓存记录的时间戳往前拨，模拟 TTL 过期。 */
function ageCache(ms: number): void {
  const path = cacheRecordPath(process.env.RDK_DOCS_CACHE_DIR!);
  const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  record.fetchedAt = Date.now() - ms;
  writeFileSync(path, JSON.stringify(record), "utf8");
}

function cacheRecordPath(cacheDir: string): string {
  const path = readdirSync(cacheDir)
    .map((name) => join(cacheDir, name))
    .filter((candidate) => statSync(candidate).isFile())
    .find((candidate) => {
      try {
        const value = JSON.parse(readFileSync(candidate, "utf8")) as { fetchedAt?: unknown };
        return typeof value.fetchedAt === "number";
      } catch {
        return false;
      }
    });
  if (!path) throw new Error(`No cache record found in ${cacheDir}`);
  return path;
}

beforeEach(() => {
  vi.stubEnv("RDK_DOCS_CACHE_DIR", tempPath());
  vi.stubEnv("RDK_DOCS_CACHE_TTL_MS", "60000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  while (tempPaths.length > 0) rmSync(tempPaths.pop()!, { recursive: true, force: true });
});

describe("fetchText cache", () => {
  it("keeps URLs that normalize to the same punctuation-safe name separate", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("first"))
      .mockResolvedValueOnce(response("second"));
    vi.stubGlobal("fetch", get);

    expect(await fetchText("https://example.test/a/b")).toBe("first");
    expect(await fetchText("https://example.test/a_b")).toBe("second");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("treats corrupt cache metadata as a miss", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("cached"))
      .mockResolvedValueOnce(response("fresh"));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/corrupt";

    expect(await fetchText(url)).toBe("cached");
    writeFileSync(cacheRecordPath(process.env.RDK_DOCS_CACHE_DIR!), "{broken", "utf8");

    expect(await fetchText(url)).toBe("fresh");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects a cache record written for a different URL", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("cached"))
      .mockResolvedValueOnce(response("fresh"));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/original";

    expect(await fetchText(url)).toBe("cached");
    const path = cacheRecordPath(process.env.RDK_DOCS_CACHE_DIR!);
    const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    record.url = "https://example.test/somewhere-else";
    writeFileSync(path, JSON.stringify(record), "utf8");

    expect(await fetchText(url)).toBe("fresh");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects a cache record whose timestamp is in the future", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("cached"))
      .mockResolvedValueOnce(response("fresh"));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/future";

    expect(await fetchText(url)).toBe("cached");
    const path = cacheRecordPath(process.env.RDK_DOCS_CACHE_DIR!);
    const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    record.fetchedAt = Date.now() + 60_000;
    writeFileSync(path, JSON.stringify(record), "utf8");

    expect(await fetchText(url)).toBe("fresh");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("revalidates index URLs on the short index TTL even when the general TTL is longer", async () => {
    vi.stubEnv("RDK_DOCS_CACHE_TTL_MS", String(24 * 60 * 60 * 1000));
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("first"))
      .mockResolvedValueOnce(response("second"));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/site/search-index.json";

    expect(await fetchText(url)).toBe("first");
    ageCache(20 * 60 * 1000);
    expect(await fetchText(url)).toBe("second");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keeps plugin page content on the general TTL", async () => {
    vi.stubEnv("RDK_DOCS_CACHE_TTL_MS", String(24 * 60 * 60 * 1000));
    const get = vi.fn<typeof fetch>().mockResolvedValue(response("page"));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/site/overview";

    expect(await fetchText(url)).toBe("page");
    ageCache(20 * 60 * 1000);
    expect(await fetchText(url)).toBe("page");
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("sends the stored validators and accepts a 304 without downloading again", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("index", { status: 200, headers: { etag: "\"v1\"" } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", get);
    const url = "https://example.test/site/search-index.json";

    expect(await fetchText(url)).toBe("index");
    ageCache(20 * 60 * 1000);

    expect(await fetchText(url)).toBe("index");
    expect(get).toHaveBeenCalledTimes(2);
    const headers = (get.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(headers["If-None-Match"]).toBe("\"v1\"");
  });

  it("serves the cached body when the network fails after expiry", async () => {
    const get = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response("cached body"))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    vi.stubGlobal("fetch", get);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const url = "https://example.test/site/searchindex.js";

    expect(await fetchText(url)).toBe("cached body");
    ageCache(20 * 60 * 1000);
    await expect(fetchText(url)).resolves.toBe("cached body");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("still throws when the network fails and nothing was cached", async () => {
    const get = vi.fn<typeof fetch>().mockRejectedValue(new Error("connect ECONNREFUSED"));
    vi.stubGlobal("fetch", get);
    await expect(fetchText("https://example.test/site/search-index.json")).rejects.toThrow("ECONNREFUSED");
  });

  it("returns a successful response when cache persistence is unavailable", async () => {
    const root = process.env.RDK_DOCS_CACHE_DIR!;
    rmSync(root, { recursive: true });
    writeFileSync(root, "this path is a file", "utf8");
    const get = vi.fn<typeof fetch>().mockResolvedValue(response("network body"));
    vi.stubGlobal("fetch", get);
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(fetchText("https://example.test/unwritable")).resolves.toBe("network body");
    expect(stderr).toHaveBeenCalledOnce();
  });
});
