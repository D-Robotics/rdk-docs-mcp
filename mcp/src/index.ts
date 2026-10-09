#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatInstallReport, installRdkDocs, refreshInstalledSkillsOnStart } from "./install.js";
import { createServer } from "./server.js";

async function main() {
  if (process.argv.includes("--install")) {
    const result = installRdkDocs();
    process.stdout.write(`${formatInstallReport(result)}\n`);
    process.exit(result.warnings.length > 0 && result.mcp.length === 0 ? 1 : 0);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Skill refresh walks client config dirs. Do not block the MCP initialize handshake on it.
  setImmediate(() => refreshInstalledSkillsOnStart());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`rdk-docs-mcp failed: ${message}`);
  process.exit(1);
});
