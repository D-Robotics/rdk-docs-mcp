/**
 * Dev-set ablation. Not an eval. One process, indexes kept warm.
 * Run: npx vite-node dev/ablation.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { markPackagedIndex, rankCorpora } from "../src/bm25.js";
import { readPrebuilt } from "../src/index-store.js";
import { matchQuality } from "../src/search.js";

type DevCase = {
  id: string;
  query: string;
  manuals: string[];
  hope?: string;
  expectAbstain?: boolean;
};

const cases = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8")) as DevCase[];
const cache = new Map<string, ReturnType<typeof readPrebuilt>>();

function groupsFor(manuals: string[]) {
  return manuals.map((id) => {
    const hit = cache.get(id);
    if (hit) return hit;
    const docs = readPrebuilt(id) ?? [];
    if (docs.length > 0) markPackagedIndex(docs);
    cache.set(id, docs);
    return docs;
  });
}

function score() {
  let top1 = 0;
  let ranked = 0;
  let abstainOk = 0;
  let abstainN = 0;
  const misses: string[] = [];
  for (const item of cases) {
    const groups = groupsFor(item.manuals);
    const hits = rankCorpora(groups, item.query);
    const quality = matchQuality(hits, groups, item.query);
    const url = hits[0]?.url ?? "";
    if (item.expectAbstain) {
      abstainN += 1;
      if (quality.noGoodMatch) abstainOk += 1;
      else misses.push(item.id);
    } else {
      ranked += 1;
      const hoped = item.hope ? url.toLowerCase().includes(item.hope.toLowerCase()) : false;
      if (hoped) top1 += 1;
      else misses.push(`${item.id} -> ${url.split("/").slice(-2).join("/")}`);
    }
  }
  return { top1, ranked, abstainOk, abstainN, misses };
}

const flags = ["none", "segment", "identifier", "phrase", "board", "titledf", "oos", "structure"];
const results: Record<string, ReturnType<typeof score>> = {};
for (const flag of flags) {
  process.env.RDK_ABLATE = flag === "none" ? "" : flag;
  results[flag] = score();
  const row = results[flag];
  process.stdout.write(
    `${flag}\ttop1 ${row.top1}/${row.ranked}\tabstain ${row.abstainOk}/${row.abstainN}\t${row.misses.join(" | ")}\n`,
  );
}

// Warm latency on the dev queries, indexes already resident.
const samples: number[] = [];
for (let round = 0; round < 5; round += 1) {
  for (const item of cases) {
    const groups = groupsFor(item.manuals);
    const started = performance.now();
    rankCorpora(groups, item.query);
    samples.push(performance.now() - started);
  }
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
process.stdout.write(`warm p95 ${p95.toFixed(2)}ms n=${samples.length} max ${samples.at(-1)?.toFixed(2)}ms\n`);

writeFileSync(
  new URL("./ablation.json", import.meta.url),
  `${JSON.stringify(
    {
      note: "Debugging questions only. Hope paths are labels, not the hidden eval. FAQ answers are a separate lower-weight field. Segmentation stays on because it recovers x3-version; public hit@1 does not move when it is ablated. jetson and raspberry do not abstain: the camera words are in the manuals, which is main's rule. excel, k8s, and recipe do.",
      results,
      warmP95Ms: Math.round(p95 * 100) / 100,
    },
    null,
    2,
  )}\n`,
);
