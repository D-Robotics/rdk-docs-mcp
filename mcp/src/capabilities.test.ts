import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

async function connect() {
  const server = createServer();
  const [a,b] = InMemoryTransport.createLinkedPair();
  const client = new Client({name:"capability-test",version:"1"});
  await Promise.all([client.connect(a),server.connect(b)]);
  return client;
}

describe("compatible capability contract", () => {
  it("advertises new fields and a human title with stable identity", async () => {
    const client = await connect();
    try {
      expect(client.getServerVersion()).toMatchObject({name:"rdk-docs",title:"RDK Assistant MCP",version:"0.2.0"});
      const {tools} = await client.listTools();
      const properties = (name:string) => tools.find(t=>t.name===name)?.inputSchema.properties;
      expect(properties("search_skills")).toHaveProperty("role");
      expect(properties("get_skill")).toHaveProperty("include_content");
      expect(properties("get_page")).toHaveProperty("expected_content_hash");
      const status = await client.callTool({name:"get_status",arguments:{}});
      expect(status.isError).not.toBe(true);
      expect(JSON.parse((status.content as any)[0].text).catalog.status).toBe("not_checked");
    } finally { await client.close(); }
  });

  it("rejects misspelled constraints instead of silently discarding them", async () => {
    const client = await connect();
    try {
      const search = await client.callTool({name:"search_skills",arguments:{query:"camera",task:"camera",exclude_platform:["x5"]}});
      expect(search.isError).toBe(true);
      expect(JSON.stringify(search)).toMatch(/exclude_platform|unrecognized/i);
      const detail = await client.callTool({name:"get_skill",arguments:{name:"camera",include_contents:true}});
      expect(detail.isError).toBe(true);
    } finally { await client.close(); }
  });
});
