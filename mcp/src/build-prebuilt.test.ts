import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { commitCheckedManuals, preserveSnapshotOrder, sameSnapshotDocs, type CheckedManual } from "./build-prebuilt.js";
import type { IndexedDoc } from "./types.js";

function sample(manualId: string): IndexedDoc {
  return {
    manualId,
    title: "页面",
    url: `https://example.test/${manualId}/page`,
    text: "正文",
    kind: "page",
  };
}

function checked(manualId: string, before: number, after: number): CheckedManual {
  return {
    manualId,
    docs: [sample(manualId)],
    before,
    after,
    builtAt: "2026-01-01T00:00:00.000Z",
    changed: true,
  };
}

describe("preserveSnapshotOrder", () => {
  it("keeps the previous order and appends a new document", () => {
    const prior = [sample("b"), sample("a")];
    const next = [sample("a"), { ...sample("c"), title: "新" }, sample("b")];
    const ordered = preserveSnapshotOrder(prior, next);
    expect(ordered.map((doc) => doc.url)).toEqual([
      "https://example.test/b/page",
      "https://example.test/a/page",
      "https://example.test/c/page",
    ]);
    expect(ordered[2]?.title).toBe("新");
  });

  it("treats the same documents as reusable postings", () => {
    const prior = [sample("a"), sample("b")];
    expect(sameSnapshotDocs(prior, [sample("a"), sample("b")])).toBe(true);
    expect(sameSnapshotDocs(prior, [sample("b"), sample("a")])).toBe(false);
    expect(sameSnapshotDocs(undefined, prior)).toBe(false);
  });
});

describe("commitCheckedManuals", () => {
  it("leaves the previous snapshot and manifest in place when one manual drops more than 2%", () => {
    const dir = mkdtempSync(join(tmpdir(), "rdk-index-"));
    const snapshot = join(dir, "oe-x5.json.gz");
    const manifest = join(dir, "manifest.json");
    writeFileSync(snapshot, Buffer.from("original-snapshot"));
    writeFileSync(manifest, '{"builtAt":"old"}\n');

    expect(() =>
      commitCheckedManuals(dir, [checked("oe-x5", 10, 7), checked("rdk-x", 1000, 1000)], "2026-02-01T00:00:00.000Z"),
    ).toThrow(/oe-x5: 3 of 10/);

    expect(readFileSync(snapshot).toString()).toBe("original-snapshot");
    expect(readFileSync(manifest, "utf8")).toContain("old");
  });

  it("writes every snapshot and the manifest only after each manual is within 2%", () => {
    const dir = mkdtempSync(join(tmpdir(), "rdk-index-"));
    commitCheckedManuals(dir, [checked("oe-x5", 100, 99), checked("rdk-x", 1000, 990)], "2026-02-01T00:00:00.000Z");
    const parsed = JSON.parse(gunzipSync(readFileSync(join(dir, "oe-x5.json.gz"))).toString("utf8")) as {
      docs: IndexedDoc[];
    };
    expect(parsed.docs[0]?.title).toBe("页面");
    const manifest = readFileSync(join(dir, "manifest.json"), "utf8");
    expect(manifest).toContain("oe-x5");
    expect(manifest).toContain("rdk-x");
    expect(manifest).toContain("2026-02-01T00:00:00.000Z");
  });
});
