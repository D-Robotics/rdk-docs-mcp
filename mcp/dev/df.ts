/** Count how many rdk-x docs contain a substring. Debugging only. */
import { readPrebuilt } from "../src/index-store.js";

const docs = readPrebuilt("rdk-x") ?? [];
const needles = process.argv.slice(2);
for (const needle of needles) {
  let n = 0;
  let title = 0;
  for (const doc of docs) {
    const blob = `${doc.title}\n${doc.text ?? ""}\n${doc.snippet ?? ""}`;
    if (blob.includes(needle)) {
      n += 1;
      if (doc.title.includes(needle)) title += 1;
    }
  }
  process.stdout.write(`${needle}\t${n}/${docs.length}\ttitle ${title}\n`);
}
