import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PACKAGE_VERSION } from "./server.js";

describe("server version", () => {
  it("advertises the package version, never a hardcoded drift (issue #5 §6)", () => {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const { version } = JSON.parse(readFileSync(manifest, "utf8")) as { version: string };
    expect(PACKAGE_VERSION).toBe(version);
  });
});
