import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run via npm run verify:package so npm's portable CLI path is available");
const sandbox = mkdtempSync(join(tmpdir(),"rdk-package-verification-"));
const runNpm = args => execFileSync(process.execPath,[npmCli,...args],{cwd:root,encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]});
const packed = JSON.parse(runNpm(["pack","--json","--pack-destination",sandbox]));
// npm versions expose either an array or a package-name map.
const artifact = Array.isArray(packed) ? packed[0] : packed["rdk-docs-mcp"];
assert.equal(typeof artifact?.filename,"string","npm pack must identify its tarball");
const installation = join(sandbox,"consumer");
runNpm(["install","--prefix",installation,"--ignore-scripts","--no-audit","--no-fund",join(sandbox,artifact.filename)]);
const packageRoot = join(installation,"node_modules","rdk-docs-mcp");
const entry = join(packageRoot,"dist","index.js");
const isolatedHome = join(sandbox,"home");
const sentinel = join(isolatedHome,".codex","skills","rdk-docs","SKILL.md");
mkdirSync(join(isolatedHome,".codex","skills","rdk-docs"),{recursive:true});
writeFileSync(sentinel,"user-owned sentinel");
const env = {...process.env,HOME:isolatedHome,USERPROFILE:isolatedHome,RDK_DOCS_CACHE_DIR:join(sandbox,"cache")};
const doctor = JSON.parse(execFileSync(process.execPath,[entry,"--doctor"],{env,encoding:"utf8",timeout:15000}));
assert.equal(readFileSync(sentinel,"utf8"),"user-owned sentinel","doctor must not refresh Skill files");
assert.equal(doctor.version,JSON.parse(readFileSync(join(root,"package.json"),"utf8")).version);
assert.equal(doctor.catalog.status,"not_checked");
const guide = readFileSync(join(packageRoot,"skills","rdk-docs","SKILL.md"),"utf8");
assert(guide.includes("get_status") && guide.includes("category_only") && guide.includes("model_compile"));
const client = new Client({name:"packed-artifact-verification",version:"1"});
const transport = new StdioClientTransport({command:process.execPath,args:[entry],env,stderr:"pipe"});
let tools;
try {
  await client.connect(transport);
  tools = (await client.listTools()).tools;
  assert.equal(tools.length,7);
  assert.equal(client.getServerVersion().title,"RDK Assistant MCP");
  for (const [tool,field] of [["search_skills","role"],["get_skill","include_content"],["get_page","expected_content_hash"]]) {
    assert(field in tools.find(t=>t.name===tool).inputSchema.properties);
  }
  const bad = await client.callTool({name:"search_skills",arguments:{query:"camera",task:"camera",unknown_constraint:true}});
  assert.equal(bad.isError,true);
} finally { await client.close(); }
const evidence = {package:artifact.filename,version:doctor.version,display_name:doctor.display_name,tools:tools.map(t=>t.name),doctor_preserved_user_skill:true,bundled_guide_matches:true,unknown_arguments_rejected:true,sandbox};
writeFileSync(join(sandbox,"result.json"),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
