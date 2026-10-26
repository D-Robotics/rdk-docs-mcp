import { absentCommandToken, markPackagedIndex, rankCorpora } from "../src/bm25.js";
import { readPrebuilt } from "../src/index-store.js";
import { matchQuality } from "../src/search.js";

const docs = readPrebuilt("rdk-x") ?? [];
markPackagedIndex(docs);
const queries = process.argv.slice(2);
for (const q of queries) {
  const hits = rankCorpora([docs], q).slice(0, 6);
  const quality = matchQuality(hits, [docs], q);
  console.log("\n==", q, JSON.stringify(quality), "absent", absentCommandToken([docs], q));
  for (const h of hits) {
    console.log(
      h.score.toFixed(4),
      h.quality,
      "cov",
      h.coverage,
      "conf",
      h.confidence,
      h.title.slice(0, 70),
      h.url.replace("https://developer.d-robotics.cc", "").slice(0, 140),
    );
  }
}
