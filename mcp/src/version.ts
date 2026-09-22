import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DISPLAY_NAME = "RDK Assistant MCP";
export const PACKAGE_NAME = "rdk-docs-mcp";
export const SERVER_ID = "rdk-docs";
export const CAPABILITY_SCHEMA_VERSION = 1;

/** Read the installed manifest, so source, packed artifact and diagnostics agree. */
export const PACKAGE_VERSION: string = (() => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));
  if (typeof manifest.version !== "string") throw new Error("Package version is missing");
  return manifest.version;
})();
