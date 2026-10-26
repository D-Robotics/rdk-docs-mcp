/** Compare noGoodMatch for the queries in oos-queries.json. Offline, all manuals. */
import { readFileSync, writeFileSync } from "node:fs";
import { fetchText } from "../src/http.js";
import { searchDocs } from "../src/service.js";

process.env.RDK_DOCS_OFFLINE = "1";

const queries = JSON.parse(readFileSync(new URL("./oos-queries.json", import.meta.url), "utf8")) as string[];
const out: Array<{ query: string; abstain: boolean; url: string; coverage: number | undefined }> = [];
for (const query of queries) {
  const value = await searchDocs({ query, limit: 3 }, fetchText);
  out.push({
    query,
    abstain: Boolean(value.noGoodMatch),
    url: value.hits[0]?.url ?? "",
    coverage: value.hits[0]?.coverage,
  });
  process.stdout.write(`${value.noGoodMatch ? "ABSTAIN" : "answer "}\t${query}\t${value.hits[0]?.url ?? ""}\n`);
}
const dest = process.argv[2] ?? "/tmp/oos-now.json";
writeFileSync(dest, JSON.stringify(out, null, 2));
