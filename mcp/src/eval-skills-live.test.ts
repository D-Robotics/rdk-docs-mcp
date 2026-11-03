import { afterEach, expect, it, vi } from "vitest";

const REVISION = "f205371baee8731988c8857ead7ffe23b67c501c";
const FETCHED_AT = "2026-11-03T00:00:00.000Z";

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {},
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    private calls = 0;
    async connect() {}
    async close() {}
    async listTools() {
      return { tools: ["list_manuals", "search_docs", "get_page", "list_toc", "search_skills", "get_skill"].map(name => ({ name })) };
    }
    async callTool({ name, arguments: args }: { name: string; arguments: { query?: string; name?: string } }) {
      const error = (code: string) => ({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message: "simulated" } }) }] });
      if (++this.calls <= 6) return error("catalog_unavailable");

      let result: Record<string, unknown>;
      if (name === "search_skills") {
        switch (args.query) {
          case "X5 PTQ 量化部署": result = { matches: [{ name: "x5-ptq-deploy", install_type: "workspace" }] }; break;
          case "X5 模型量化": result = { matches: [{ name: "x5-router" }], guidance: "PTQ QAT" }; break;
          case "现成的量化好的模型直接用": result = { matches: [{ name: "rdk-model-zoo" }], guidance_kind: "default" }; break;
          case "X5 上把模型量化后部署": result = { matches: [{ name: "x5-router", pack: "OE Tool Chain (X5)" }], guidance_kind: "ambiguous_quant" }; break;
          case "quantization": result = { matches: [], guidance_kind: "ambiguous_quant" }; break;
          case "X5 PTQ": result = { matches: [], guidance_kind: "platform_conflict", guidance: "X5 S100" }; break;
          default: result = { matches: [] };
        }
      } else if (args.name === "rdk-gpio-40pin") {
        result = {
          installation: { type: "flat", args: ["skills", "add", "d-robotics/rdk-skills", "--skill", "rdk-gpio-40pin"] },
          source_url: `https://github.com/D-Robotics/rdk-skills/blob/${REVISION}/skills/rdk-gpio-40pin/SKILL.md`,
        };
      } else if (args.name === "x5-ptq-deploy") {
        result = { installation: { type: "workspace", handoff_skill: "rdk-pack-installer", installer: { args: ["rdk-pack-installer"] }, pack: { name: "X5", ref: "v1", verify_paths: ["VERSION"] }, requires_project_root: true } };
      } else if (args.name === "s-plugin-set-fake-quantize") {
        result = { name: args.name, display_name: args.name };
      } else {
        return error("unknown_skill");
      }
      return { content: [{ type: "text", text: JSON.stringify({ ...result, catalog_revision: REVISION, fetched_at: FETCHED_AT }) }] };
    }
  },
}));

afterEach(() => vi.restoreAllMocks());

it("keeps failed checks while reporting the catalog revision after recovery", async () => {
  const priorExitCode = process.exitCode;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  process.exitCode = 0;
  try {
    await import("./eval-skills-live.js");
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    const output = log.mock.calls.map(args => args.join(" ")).join("\n");
    expect(output).toContain("12/18 live skill-catalog checks passed");
    expect(output).toContain(`catalog revision ${REVISION}, fetched_at ${FETCHED_AT}`);
  } finally {
    process.exitCode = priorExitCode;
  }
});
