import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fetchText } from "../dist/http.js";
import { searchDocs } from "../dist/service.js";

process.env.RDK_DOCS_OFFLINE = "1";

const suite = JSON.parse(readFileSync(new URL("../dev/colloquial-cases.json", import.meta.url), "utf8"));

function rankOf(hits, needles) {
  const lowered = needles.map((needle) => needle.toLowerCase());
  const index = hits.findIndex((hit) => lowered.some((needle) => (hit.url || "").toLowerCase().includes(needle)));
  return index === -1 ? null : index + 1;
}

const times = [];
let hit1 = 0;
let hit3 = 0;
let mrr = 0;
let ngWrong = 0;
const misses = [];

for (const item of suite.search) {
  const started = performance.now();
  const value = await searchDocs(
    { query: item.query, manual: item.manual, limit: 8 },
    fetchText,
  );
  const ms = performance.now() - started;
  times.push(ms);
  const ng = Boolean(value.noGoodMatch);
  if (item.expectNoGoodMatch === true) {
    const ok = ng === true;
    if (ok) {
      hit1 += 1;
      hit3 += 1;
      mrr += 1;
    } else {
      misses.push({ id: item.id, rank: null, ng, top: value.hits[0]?.url });
    }
    continue;
  }
  if (item.expectNoGoodMatch === false && ng) ngWrong += 1;
  const rank = rankOf(value.hits, item.expectUrlIncludes ?? []);
  if (rank === 1) hit1 += 1;
  if (rank !== null && rank <= 3) hit3 += 1;
  if (rank) mrr += 1 / rank;
  if (rank !== 1) {
    misses.push({
      id: item.id,
      rank,
      ng,
      top: (value.hits[0]?.url || "").replace("https://developer.d-robotics.cc", ""),
    });
  }
}

times.sort((a, b) => a - b);
const n = suite.search.length;
const p95 = times[Math.min(times.length - 1, Math.max(0, Math.ceil(0.95 * times.length) - 1))];
console.log(
  JSON.stringify(
    {
      n,
      hitAt1: Math.round((hit1 / n) * 1000) / 1000,
      hitAt3: Math.round((hit3 / n) * 1000) / 1000,
      mrr: Math.round((mrr / n) * 1000) / 1000,
      p95Ms: Math.round(p95),
      meanMs: Math.round(times.reduce((s, v) => s + v, 0) / times.length),
      noGoodMatchFalsePositives: ngWrong,
      misses,
    },
    null,
    2,
  ),
);
