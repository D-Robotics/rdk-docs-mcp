import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./http.js";
import { getPage, listToc, searchDocs } from "./service.js";
import { scoreCase, scoreForumToc, type EvalCase } from "./eval.js";
import { runUsabilityChecks } from "./eval-usability.js";

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
    const hit = evalCase.firstHitMustInclude?.length
      ? search.hits[0]
      : search.hits.find((item) =>
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

  const toc = await listToc({ manual: "forum" }, fetchText);
  const tocScore = scoreForumToc(toc.pages);
  console.log(`${tocScore.pass ? "PASS" : "FAIL"}  forum-list-toc  ${tocScore.reason}`);
  results.push({
    id: "forum-list-toc",
    question: "列出开发与问题和通用最近帖",
    searchPass: tocScore.pass,
    pagePass: tocScore.pass,
    pass: tocScore.pass,
    reason: tocScore.reason,
  });

  if (toc.pages[0]) {
    const topic = await getPage({ url: toc.pages[0].url, maxChars: 4000 }, fetchText);
    const pageOk = Boolean(topic.markdown.trim()) && topic.url.includes("forum.d-robotics.cc");
    const reason = pageOk
      ? `opened ${topic.title}`
      : `empty or invalid topic page: ${toc.pages[0].url}`;
    console.log(`${pageOk ? "PASS" : "FAIL"}  forum-list-toc-page  ${reason}  ${topic.url}`);
    results.push({
      id: "forum-list-toc-page",
      question: "打开板块最近帖正文",
      searchPass: true,
      pagePass: pageOk,
      pass: pageOk,
      hitUrl: topic.url,
      hitTitle: topic.title,
      reason,
    });
  }

  const filtered = await listToc({ manual: "forum", query: "开发与问题" }, fetchText);
  const filterOk =
    filtered.pages.length > 0 &&
    filtered.pages.every((page) => page.breadcrumbs?.[0] === "开发与问题");
  const filterReason = filterOk
    ? `filtered to ${filtered.pages.length} topics on 开发与问题`
    : "forum toc query=开发与问题 did not stay on that board";
  console.log(`${filterOk ? "PASS" : "FAIL"}  forum-list-toc-filter  ${filterReason}`);
  results.push({
    id: "forum-list-toc-filter",
    question: "按板块过滤论坛最近帖",
    searchPass: filterOk,
    pagePass: filterOk,
    pass: filterOk,
    reason: filterReason,
  });

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
  console.log(`\n${passed}/${results.length} cases can answer the developer question`);
  if (passed < results.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
