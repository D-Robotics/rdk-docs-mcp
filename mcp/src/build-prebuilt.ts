import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { encodeBm25 } from "./bm25.js";
import { listManuals } from "./catalog.js";
import { fetchText } from "./http.js";
import { prebuiltDir } from "./index-store.js";
import { dropDocsForDeadPages, excessivePageDrop, findDeadPageUrls, pageUrl, pageUrlsOf, proxyFetchWarning } from "./link-check.js";
import { loadIndexFromOrigin } from "./service.js";
import type { IndexedDoc } from "./types.js";

type SnapshotFile = {
  builtAt: string;
  manualId: string;
  docCount: number;
  docs: IndexedDoc[];
};

function compact(doc: IndexedDoc): IndexedDoc {
  const out: IndexedDoc = {
    manualId: doc.manualId,
    title: doc.title,
    url: doc.url,
    kind: doc.kind,
  };
  if (doc.snippet) out.snippet = doc.snippet;
  if (doc.text) out.text = doc.text;
  if (doc.answer) out.answer = doc.answer;
  if (doc.breadcrumbs?.length) out.breadcrumbs = doc.breadcrumbs;
  return out;
}

function writePostings(dir: string, manualId: string, docs: IndexedDoc[]): number {
  const gzip = gzipSync(encodeBm25(docs));
  writeFileSync(join(dir, `${manualId}.bm25.gz`), gzip);
  return gzip.length;
}

function writeSnapshot(dir: string, manualId: string, docs: IndexedDoc[], builtAt: string): number {
  const body: SnapshotFile = { builtAt, manualId, docCount: docs.length, docs };
  const gzip = gzipSync(Buffer.from(JSON.stringify(body)));
  writeFileSync(join(dir, `${manualId}.json.gz`), gzip);
  return gzip.length;
}

function readSnapshot(path: string, manualId: string): { builtAt: string; docs: IndexedDoc[] } {
  const parsed = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as unknown;
  if (Array.isArray(parsed)) return { builtAt: "", docs: parsed as IndexedDoc[] };
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { docs?: unknown }).docs)) {
    const body = parsed as { builtAt?: string; docs: IndexedDoc[] };
    return { builtAt: body.builtAt ?? "", docs: body.docs };
  }
  throw new Error(`${manualId} snapshot is not an index`);
}

function pageCount(docs: IndexedDoc[]): number {
  return new Set(docs.filter((doc) => doc.kind === "page").map((doc) => pageUrl(doc.url))).size;
}

async function withoutDeadLinks(manualId: string, docs: IndexedDoc[]): Promise<{ docs: IndexedDoc[]; before: number; after: number }> {
  const before = pageCount(docs);
  const { dead, unchecked } = await findDeadPageUrls(pageUrlsOf(docs));
  if (unchecked.length > 0) {
    process.stderr.write(`link-unchecked\t${manualId}\t${unchecked.length}\n`);
  }
  if (dead.length === 0) return { docs, before, after: before };
  process.stderr.write(`drop-404\t${manualId}\t${dead.join(" ")}\n`);
  const kept = dropDocsForDeadPages(docs, new Set(dead));
  if (kept.length === 0) throw new Error(`${manualId}: every page returned 404`);
  return { docs: kept, before, after: pageCount(kept) };
}

function assertDropRate(before: number, after: number): void {
  if (!excessivePageDrop(before, after)) return;
  const dropped = before - after;
  throw new Error(`link check dropped ${dropped} of ${before} pages (${((dropped / before) * 100).toFixed(1)}% > 2%)`);
}

function writeManifest(dir: string, builtAt: string, manuals: string[]): void {
  const manifest = {
    builtAt,
    maxAgeDays: 14,
    manuals,
    refresh:
      "npm run build:index regenerates this directory and drops pages that return HTTP 404. npm publish runs it from prepublishOnly.",
  };
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function stampExisting(): void {
  const dir = prebuiltDir();
  if (!existsSync(dir)) {
    process.stderr.write(`missing ${dir}\n`);
    process.exit(1);
  }
  const manuals: string[] = [];
  let builtAt = "";
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json.gz")) continue;
    const manualId = name.replace(/\.json\.gz$/, "");
    const path = join(dir, name);
    const docs = readSnapshot(path, manualId).docs;
    if (docs.length === 0) {
      process.stderr.write(`empty\t${manualId}\n`);
      process.exitCode = 1;
      continue;
    }
    const stamped = statSync(path).mtime.toISOString();
    const bytes = writeSnapshot(dir, manualId, docs, stamped);
    const postings = writePostings(dir, manualId, docs);
    builtAt = builtAt > stamped ? builtAt : stamped;
    manuals.push(manualId);
    process.stderr.write(`stamped\t${manualId}\t${docs.length}\t${bytes}\tpostings ${postings}\t${stamped}\n`);
  }
  if (!manuals.length) process.exit(1);
  writeManifest(dir, builtAt, manuals.sort());
}

async function rebuild(): Promise<void> {
  const proxy = proxyFetchWarning();
  if (proxy) process.stderr.write(`${proxy}\n`);
  const dir = prebuiltDir();
  mkdirSync(dir, { recursive: true });
  const builtAt = new Date().toISOString();
  const manuals = listManuals().filter((manual) => manual.searchable);
  const written: string[] = [];
  let failed = 0;
  let pagesBefore = 0;
  let pagesAfter = 0;
  for (const manual of manuals) {
    const started = Date.now();
    try {
      const loaded = (await loadIndexFromOrigin(manual, fetchText)).map(compact);
      const checked = await withoutDeadLinks(manual.id, loaded);
      pagesBefore += checked.before;
      pagesAfter += checked.after;
      const docs = checked.docs;
      if (docs.length === 0) {
        process.stderr.write(`empty\t${manual.id}\n`);
        failed += 1;
        continue;
      }
      const bytes = writeSnapshot(dir, manual.id, docs, builtAt);
      const postings = writePostings(dir, manual.id, docs);
      written.push(manual.id);
      process.stderr.write(`ok\t${manual.id}\t${docs.length}\t${bytes}\tpostings ${postings}\t${Date.now() - started}ms\n`);
    } catch (error) {
      failed += 1;
      process.stderr.write(`fail\t${manual.id}\t${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  if (written.length === 0 || failed > 0) process.exitCode = 1;
  else {
    assertDropRate(pagesBefore, pagesAfter);
    writeManifest(dir, builtAt, written.sort());
  }
}

async function checkExistingLinks(): Promise<void> {
  const proxy = proxyFetchWarning();
  if (proxy) process.stderr.write(`${proxy}\n`);
  const dir = prebuiltDir();
  if (!existsSync(dir)) {
    process.stderr.write(`missing ${dir}\n`);
    process.exit(1);
    return;
  }
  const manuals: string[] = [];
  let builtAt = "";
  let pagesBefore = 0;
  let pagesAfter = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json.gz")) continue;
    const manualId = name.replace(/\.json\.gz$/, "");
    const path = join(dir, name);
    const snapshot = readSnapshot(path, manualId);
    const checked = await withoutDeadLinks(manualId, snapshot.docs);
    pagesBefore += checked.before;
    pagesAfter += checked.after;
    const docs = checked.docs;
    builtAt = builtAt > snapshot.builtAt ? builtAt : snapshot.builtAt;
    manuals.push(manualId);
    if (docs.length === snapshot.docs.length) {
      process.stderr.write(`kept\t${manualId}\t${docs.length}\n`);
      continue;
    }
    const bytes = writeSnapshot(dir, manualId, docs, snapshot.builtAt);
    const postings = writePostings(dir, manualId, docs);
    process.stderr.write(`rewrote\t${manualId}\t${snapshot.docs.length}->${docs.length}\t${bytes}\tpostings ${postings}\n`);
  }
  assertDropRate(pagesBefore, pagesAfter);
  if (!manuals.length) process.exit(1);
  else writeManifest(dir, builtAt, manuals.sort());
}

const stamp = process.argv.includes("--stamp");
const checkLinks = process.argv.includes("--check-links");
if (stamp) stampExisting();
else if (checkLinks) {
  checkExistingLinks().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
} else {
  rebuild().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
