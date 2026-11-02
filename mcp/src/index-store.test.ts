import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  memoryTtlMs,
  prebuiltAgeDays,
  prebuiltDir,
  readPrebuilt,
  readPrebuiltSnapshot,
  recallIndex,
  rememberIndex,
  snapshotBuiltAtText,
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

describe("prebuilt age", () => {
  const now = Date.parse("2026-10-09T00:00:00.000Z");

  it("treats a missing timestamp as unknown age", () => {
    expect(prebuiltAgeDays(undefined, now)).toBeUndefined();
    expect(snapshotBuiltAtText(undefined)).toContain("unknown");
  });

  it("reports the snapshot age in days", () => {
    expect(prebuiltAgeDays(new Date(now - 2 * day).toISOString(), now)).toBeCloseTo(2, 5);
    expect(snapshotBuiltAtText(new Date(now - 20 * day).toISOString())).toContain("days ago");
  });
});

describe("in-process index cache", () => {
  const http = (async () => "") as unknown as (url: string) => Promise<string>;

  it("expires entries on the same clock as the disk cache", () => {
    const docs = [{ manualId: "rdk-x", title: "GPIO", url: "https://example.test/gpio", kind: "page" as const }];
    rememberIndex(http, "rdk-x", docs);
    expect(recallIndex(http, "rdk-x")).toBe(docs);
    expect(memoryTtlMs()).toBeGreaterThan(0);
  });

  it("returns undefined for a manual that was never loaded", () => {
    expect(recallIndex(http, "zz-never-loaded")).toBeUndefined();
  });
});
