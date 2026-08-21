import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./http.js";
import { getPage, searchDocs } from "./service.js";
import { scoreCase, type EvalCase } from "./eval.js";

const root = dirname(fileURLToPath(import.meta.url));
const casesPath = join(root, "..", "eval", "cases.json");

async function main() {
  const cases = JSON.parse(await readFile(casesPath, "utf8")) as EvalCase[];
  const results = [];

  for (const evalCase of cases) {
    const search = await searchDocs(
      { query: evalCase.query, manual: evalCase.manual, limit: 5 },
      fetchText,
    );
    const hit = search.hits.find((item) =>
      evalCase.urlMustInclude.some((needle) => item.url.includes(needle) || item.title.includes(needle)),
    );
    let markdown: string | undefined;
    if (hit) {
      const page = await getPage({ url: hit.url, maxChars: 8000 }, fetchText);
      markdown = `${page.title}\n${page.markdown}`;
    }
    const score = scoreCase(evalCase, search.hits, markdown);
    results.push({
      ...score,
      topHits: search.hits.slice(0, 3).map((item) => item.title),
    });
    const mark = score.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${evalCase.id}  ${score.reason}${score.hitUrl ? `  ${score.hitUrl}` : ""}`);
  }

  const passed = results.filter((item) => item.pass).length;
  console.log(`\n${passed}/${results.length} cases can answer the developer question`);
  if (passed < results.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
