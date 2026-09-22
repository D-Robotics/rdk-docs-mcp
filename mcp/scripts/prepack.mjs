import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
// Run from any cwd. The package directory is the only generated destination.
await rm(join(root, "skills"), { recursive: true, force: true });
await mkdir(join(root, "skills"), { recursive: true });
await cp(join(root, "..", "skills"), join(root, "skills"), { recursive: true });
await cp(join(root, "..", "skills", "rdk-docs", "SKILL.md"), join(root, "SKILL.md"));
