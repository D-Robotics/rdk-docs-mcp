/** Print indexed fields for URLs matching a fragment. Debugging only. */
import { markPackagedIndex } from "../src/bm25.js";
import { readPrebuilt } from "../src/index-store.js";

const manual = process.argv[2] ?? "rdk-x";
const needle = (process.argv[3] ?? "").toLowerCase();
const docs = readPrebuilt(manual) ?? [];
markPackagedIndex(docs);
let n = 0;
for (const doc of docs) {
  const blob = `${doc.url}\n${doc.title}`.toLowerCase();
  if (!blob.includes(needle)) continue;
  n += 1;
  if (n > 12) break;
  const text = (doc.text ?? "").replace(/\s+/g, " ").slice(0, 220);
  process.stdout.write(
    `\n# ${doc.kind} ${doc.title}\n${doc.url}\ntext(${(doc.text ?? "").length}): ${text}\nsnippet: ${(doc.snippet ?? "").slice(0, 160)}\n`,
  );
}
process.stdout.write(`\nshown ${Math.min(n, 12)} of matches\n`);
