/**
 * Fresh retrieval questions for local debugging. Not an eval set.
 * Run: npx vite-node dev/diagnose.ts
 */
import { readFileSync } from "node:fs";
import { markPackagedIndex, rankCorpora } from "../src/bm25.js";
import { readPrebuilt } from "../src/index-store.js";
import { matchQuality } from "../src/search.js";

export type DevCase = {
  id: string;
  query: string;
  manuals: string[];
  note: string;
  /** Path fragment we hope to see, used only when printing a diagnosis. */
  hope?: string;
  expectAbstain?: boolean;
};

const cases: DevCase[] = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8")) as DevCase[];

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

function main() {
  let top1 = 0;
  let abstainOk = 0;
  let abstainN = 0;
  for (const item of cases) {
    const groups = groupsFor(item.manuals);
    const hits = rankCorpora(groups, item.query).slice(0, 5);
    const quality = matchQuality(hits, groups, item.query);
    const top = hits[0];
    const url = top?.url ?? "";
    const hoped = item.hope ? url.toLowerCase().includes(item.hope.toLowerCase()) : false;
    if (item.expectAbstain) {
      abstainN += 1;
      if (quality.noGoodMatch) abstainOk += 1;
    } else if (hoped) top1 += 1;
    const flag = item.expectAbstain ? (quality.noGoodMatch ? "ABSTAIN" : "MISSED-OOS") : hoped ? "hit" : "miss";
    process.stdout.write(
      `${flag}\t${item.id}\t${quality.matchQuality}\t${top?.manual ?? "-"}\t${(top?.title ?? "").slice(0, 48)}\t${url.replace("https://developer.d-robotics.cc", "")}\n`,
    );
  }
  const ranked = cases.filter((item) => !item.expectAbstain).length;
  process.stdout.write(`\nsummary top1 ${top1}/${ranked} abstain ${abstainOk}/${abstainN}\n`);
}

main();
