import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run via npm run verify:package so npm's portable CLI path is available");
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--tarball" || !args[1])) {
  throw new Error("Usage: npm run verify:package -- [--tarball <path>]");
}
const sandbox = mkdtempSync(join(tmpdir(),"rdk-package-verification-"));
const runNpm = (args, cwd = root) => execFileSync(process.execPath,[npmCli,...args],{cwd,encoding:"utf8",timeout:120000,stdio:["ignore","pipe","pipe"]});
let archive;
if (args.length) {
  archive = resolve(root, args[1]);
} else {
  const source = join(sandbox,"source");
  const packageCopy = join(source,"mcp");
  const excluded = new Set(["node_modules","dist","skills","SKILL.md",".git",".npmrc"]);
  cpSync(root,packageCopy,{recursive:true,filter:path => {
    const first = relative(root,path).split(sep)[0];
    return !excluded.has(first) && first !== ".env" && !first.startsWith(".env.") && !first.endsWith(".tgz");
  }});
  cpSync(join(root,"..","skills"),join(source,"skills"),{recursive:true});
  symlinkSync(join(root,"node_modules"),join(packageCopy,"node_modules"),process.platform === "win32" ? "junction" : "dir");
  runNpm(["run","build"],packageCopy);
  const packed = JSON.parse(runNpm(["pack","--json","--pack-destination",sandbox],packageCopy));
  // npm versions expose either an array or a package-name map.
  const artifact = Array.isArray(packed) ? packed[0] : packed["rdk-docs-mcp"];
  assert.equal(typeof artifact?.filename,"string","npm pack must identify its tarball");
  archive = join(sandbox,artifact.filename);
}
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
const installation = join(sandbox,"consumer");
runNpm(["install","--prefix",installation,"--ignore-scripts","--no-audit","--no-fund",archive]);
const audit = JSON.parse(runNpm(["audit","--omit=dev","--json"],installation));
assert.equal(audit.metadata?.vulnerabilities?.total,0,"installed production dependencies must pass npm audit");
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
assert(guide.includes("prepare_community_publish") && guide.includes("publish_case"));
const client = new Client({name:"packed-artifact-verification",version:"1"});
const transport = new StdioClientTransport({command:process.execPath,args:[entry],env,stderr:"pipe"});
let tools;
try {
  await client.connect(transport);
  tools = (await client.listTools()).tools;
  assert.equal(tools.length,13);
  assert.equal(client.getServerVersion().title,"RDK Docs");
  for (const [tool,field] of [["search_skills","role"],["get_skill","include_content"],["get_page","expected_content_hash"]]) {
    assert(field in tools.find(t=>t.name===tool).inputSchema.properties);
  }
  const bad = await client.callTool({name:"search_skills",arguments:{query:"camera",task:"camera",unknown_constraint:true}});
  assert.equal(bad.isError,true);
  const backup = `${sentinel}.bak`;
  const refreshed = () => {
    try { return existsSync(backup) && readFileSync(sentinel,"utf8") === guide; }
    catch { return false; }
  };
  const deadline = Date.now() + 5_000;
  while (!refreshed() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve,25));
  assert(existsSync(backup),"MCP startup must back up an existing Skill before refreshing it");
  assert.equal(readFileSync(backup,"utf8"),"user-owned sentinel","startup must preserve the original Skill in its backup");
  assert.equal(readFileSync(sentinel,"utf8"),guide,"startup must refresh the installed Skill after its backup");
} finally { await client.close(); }
assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"),sha256,"tarball changed during verification");
const evidence = {package:basename(archive),archive,sha256,version:doctor.version,display_name:doctor.display_name,production_audit:0,tools:tools.map(t=>t.name),doctor_preserved_user_skill:true,startup_backed_up_user_skill:true,bundled_guide_matches:true,unknown_arguments_rejected:true,sandbox};
writeFileSync(join(sandbox,"result.json"),JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
