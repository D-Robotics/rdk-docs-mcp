import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./http.js";
import { getPage, listToc, searchDocs } from "./service.js";
import { scoreCase, type EvalCase } from "./eval.js";
import { evaluateForumChecks } from "./eval-forum.js";
import { runUsabilityChecks } from "./eval-usability.js";

const root = dirname(fileURLToPath(import.meta.url));
const casesPath = join(root, "..", "eval", "cases.json");

async function main() {
  const cases = JSON.parse(await readFile(casesPath, "utf8")) as EvalCase[];
  const results = [];

  for (const evalCase of cases) {
    try {
      const search = await searchDocs(
        { query: evalCase.query, manual: evalCase.manual, limit: 5 },
        fetchText,
      );
      const hit = evalCase.firstHitMustInclude?.length
        ? search.hits[0]
        : search.hits.find((item) =>
            evalCase.urlMustInclude.some((needle) => item.url.includes(needle) || item.title.includes(needle)),
          );
      let markdown: string | undefined;
      if (hit) {
        const page = await getPage({ url: hit.url, maxChars: 8000, full: true }, fetchText);
        markdown = page.markdown;
      }
      const score = scoreCase(evalCase, search.hits, markdown, search.warnings);
      results.push({
        ...score,
        topHits: search.hits.slice(0, 3).map((item) => item.title),
      });
      const mark = score.pass ? "PASS" : "FAIL";
      console.log(`${mark}  ${evalCase.id}  ${score.reason}${score.hitUrl ? `  ${score.hitUrl}` : ""}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`FAIL  ${evalCase.id}  ${reason}`);
      results.push({
        id: evalCase.id,
        question: evalCase.question,
        searchPass: false,
        pagePass: false,
        pass: false,
        reason,
      });
    }
  }

  const forumChecks = await evaluateForumChecks({
    listToc: (input) => listToc(input, fetchText),
    getPage: (url) => getPage({ url, maxChars: 4000, full: true }, fetchText),
  });
  for (const item of forumChecks) {
    console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.id}  ${item.reason}${item.hitUrl ? `  ${item.hitUrl}` : ""}`);
    results.push(item);
  }

  const usability = await runUsabilityChecks(fetchText);
  for (const item of usability) {
    console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.id}  ${item.reason}`);
    results.push({
      id: item.id,
      question: item.id,
      searchPass: item.pass,
      pagePass: item.pass,
      pass: item.pass,
      reason: item.reason,
    });
  }

  const passed = results.filter((item) => item.pass).length;
  console.log(`\n${passed}/${results.length} retrieval checks passed; final answers were not evaluated`);
  if (passed < results.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
