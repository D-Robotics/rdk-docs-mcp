/** Refresh docusaurus snapshots so heading answer text is kept. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { encodeBm25 } from "../src/bm25.js";
import { listManuals } from "../src/catalog.js";
import { fetchText } from "../src/http.js";
import { prebuiltDir } from "../src/index-store.js";
import { loadIndexFromOrigin } from "../src/service.js";

const manuals = listManuals().filter((manual) => manual.indexKind === "docusaurus");
const dir = prebuiltDir();
mkdirSync(dir, { recursive: true });
const builtAt = new Date().toISOString();
for (const manual of manuals) {
  const started = Date.now();
  const docs = await loadIndexFromOrigin(manual, fetchText);
  const body = { builtAt, manualId: manual.id, docCount: docs.length, docs };
  const jsonBytes = gzipSync(Buffer.from(JSON.stringify(body))).length;
  writeFileSync(join(dir, `${manual.id}.json.gz`), gzipSync(Buffer.from(JSON.stringify(body))));
  const postings = gzipSync(encodeBm25(docs));
  writeFileSync(join(dir, `${manual.id}.bm25.gz`), postings);
  const answers = docs.filter((doc) => doc.kind === "heading" && (doc.answer?.length ?? 0) > 40).length;
  process.stderr.write(
    `${manual.id}\tdocs ${docs.length}\tanswers ${answers}\tjson ${jsonBytes}\tbm25 ${postings.length}\t${Date.now() - started}ms\n`,
  );
}
