import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  prebuiltAgeDays,
  prebuiltDir,
  prebuiltIsStale,
  readPrebuilt,
  readPrebuiltSnapshot,
  staleIndexWarning,
} from "./index-store.js";

const day = 24 * 60 * 60 * 1000;

describe("readPrebuilt", () => {
  it("returns undefined when the manual snapshot is absent", () => {
    expect(readPrebuilt("zz-missing-manual")).toBeUndefined();
  });

  it("inflates a gzipped snapshot envelope and a legacy array", () => {
    const dir = prebuiltDir();
    mkdirSync(dir, { recursive: true });
    const id = "zz-test-manual";
    const path = join(dir, `${id}.json.gz`);
    const docs = [
      {
        manualId: id,
        title: "GPIO",
        url: "https://example.test/gpio",
        kind: "page" as const,
        text: "gpio",
      },
    ];
    const builtAt = new Date().toISOString();
    writeFileSync(path, gzipSync(Buffer.from(JSON.stringify({ builtAt, manualId: id, docCount: 1, docs }))));
    try {
      expect(readPrebuilt(id)?.[0]?.title).toBe("GPIO");
      expect(readPrebuiltSnapshot(id)?.builtAt).toBe(builtAt);
    } finally {
      rmSync(path, { force: true });
    }

    const legacy = "zz-test-legacy";
    const legacyPath = join(dir, `${legacy}.json.gz`);
    writeFileSync(legacyPath, gzipSync(Buffer.from(JSON.stringify(docs))));
    try {
      expect(readPrebuilt(legacy)?.[0]?.title).toBe("GPIO");
      expect(readPrebuiltSnapshot(legacy)?.builtAt).toBeUndefined();
    } finally {
      rmSync(legacyPath, { force: true });
    }
  });
});

describe("prebuilt freshness", () => {
  const now = Date.parse("2026-10-09T00:00:00.000Z");

  it("treats a missing timestamp as stale", () => {
    expect(prebuiltIsStale(undefined, now)).toBe(true);
    expect(prebuiltAgeDays(undefined, now)).toBeUndefined();
  });

  it("accepts a snapshot inside the max age and rejects an older one", () => {
    expect(prebuiltIsStale(new Date(now - 2 * day).toISOString(), now)).toBe(false);
    expect(prebuiltIsStale(new Date(now - 20 * day).toISOString(), now)).toBe(true);
  });

  it("names the refresh command in the warning", () => {
    const text = staleIndexWarning("rdk-x", new Date(now - 20 * day).toISOString(), "live");
    expect(text).toContain("rdk-x");
    expect(text).toContain("npm run build:index");
    expect(text).toContain("live index");
  });
});
