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
