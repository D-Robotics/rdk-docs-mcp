import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/verify-package.mjs", import.meta.url));
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function runWithFakeNpm(archiveExists: boolean, useSuppliedArchive = true) {
  const dir = mkdtempSync(join(tmpdir(), "rdk-package-args-test-"));
  dirs.push(dir);
  const archive = join(dir, "candidate.tgz");
  const capture = join(dir, "npm-call.json");
  const npmCli = join(dir, "fake-npm.cjs");
  writeFileSync(npmCli, 'const fs = require("node:fs"); const path = require("node:path"); fs.writeFileSync(process.env.RDK_TEST_CAPTURE, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), hasSkill: fs.existsSync(path.join(process.cwd(), "..", "skills", "rdk-docs", "SKILL.md"))})); process.exit(17);');
  if (archiveExists) writeFileSync(archive, "archive fixture");
  const result = spawnSync(process.execPath, useSuppliedArchive ? [script, "--tarball", archive] : [script], {
    encoding: "utf8",
    env: { ...process.env, npm_execpath: npmCli, RDK_TEST_CAPTURE: capture },
  });
  return { archive, capture, result };
}

describe("release tarball verification", () => {
  it("rejects a missing supplied tarball before invoking npm", () => {
    const { capture, result } = runWithFakeNpm(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ENOENT");
    expect(existsSync(capture)).toBe(false);
  });

  it("installs the supplied tarball instead of packing a different one", () => {
    const { archive, capture, result } = runWithFakeNpm(true);
    expect(result.status).not.toBe(0); // the fake npm intentionally exits before installation
    const { args } = JSON.parse(readFileSync(capture, "utf8")) as { args: string[] };
    expect(args[0]).toBe("install");
    expect(args).toContain(archive);
    expect(args).not.toContain("pack");
  });

  it("builds and packs only in an isolated copy containing the bundled Skills", () => {
    const { capture, result } = runWithFakeNpm(false, false);
    expect(result.status).not.toBe(0); // the fake npm intentionally stops before building
    const call = JSON.parse(readFileSync(capture, "utf8")) as { args: string[]; cwd: string; hasSkill: boolean };
    expect(call.args).toEqual(["run", "build"]);
    expect(resolve(call.cwd)).not.toBe(resolve(fileURLToPath(new URL("..", import.meta.url))));
    expect(call.hasSkill).toBe(true);
  });

  it("does not build the working tree before checking a supplied tarball", () => {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(manifest.scripts["verify:package"]).toBe("node scripts/verify-package.mjs");
  });
});
