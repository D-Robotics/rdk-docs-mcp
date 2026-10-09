import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchText } from "./http.js";
import { getPage, searchDocs } from "./service.js";
import {
  scoreRetrievalCase,
  summarize,
  type CaseMetric,
  type PageCheck,
  type RetrievalCase,
} from "./eval-metrics.js";

type Suite = { search: RetrievalCase[]; pages: PageCheck[] };

type PageMetric = {
  id: string;
  pass: boolean;
  ms: number;
  reason: string;
  imageOnly?: boolean;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function time<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - started };
}

function pagePass(markdown: string, imageOnly: boolean | undefined, check: PageCheck): { pass: boolean; reason: string } {
  const missing = check.mustInclude.filter((term) => !markdown.toLowerCase().includes(term.toLowerCase()));
  if (missing.length > 0) {
    return { pass: false, reason: `missing ${missing.join(", ")}` };
  }
  if (check.expectImageOnly && imageOnly !== true) {
    return { pass: false, reason: "expected imageOnly" };
  }
  return { pass: true, reason: check.expectImageOnly ? "section flagged image-only" : "section contains the fact" };
}

async function main() {
  const offline = process.argv.includes("--offline") || process.env.RDK_DOCS_EVAL_OFFLINE === "1";
  if (offline) process.env.RDK_DOCS_OFFLINE = "1";

  const here = dirname(fileURLToPath(import.meta.url));
  const suitePath = arg("--cases") ?? join(here, "..", "eval", "retrieval-cases.json");
  const outPath = arg("--out") ?? join(here, "..", "eval", "retrieval-report.json");
  const suite = JSON.parse(readFileSync(suitePath, "utf8")) as Suite;
  const searchCases = offline
    ? suite.search.filter((item) => item.source !== "forum" && item.manual !== "forum")
    : suite.search;

  if (!process.env.RDK_DOCS_CACHE_DIR) {
    process.env.RDK_DOCS_CACHE_DIR = mkdtempSync(join(tmpdir(), "rdk-retrieval-eval-"));
  }

  const cold = await time(() => searchDocs({ query: "摄像头黑屏怎么办", limit: 5 }, fetchText));
  const warm = await time(() => searchDocs({ query: "摄像头黑屏怎么办", limit: 5 }, fetchText));
  const scoped = await time(() => searchDocs({ query: "X5 GPIO 怎么用", manual: "x5", limit: 5 }, fetchText));
  const forum = offline
    ? { value: { hits: [] as Array<{ title?: string }> }, ms: 0 }
    : await time(() => searchDocs({ query: "camera no image", source: "forum", limit: 5 }, fetchText));

  const searchMetrics: CaseMetric[] = [];
  for (const evalCase of searchCases) {
    const { value, ms } = await time(() =>
      searchDocs(
        {
          query: evalCase.query,
          manual: evalCase.manual,
          source: evalCase.source,
          limit: evalCase.limit ?? 8,
          board: evalCase.board,
        } as Parameters<typeof searchDocs>[0],
        fetchText,
      ),
    );
    const noGoodMatch = Boolean((value as { noGoodMatch?: boolean }).noGoodMatch);
    searchMetrics.push(scoreRetrievalCase(evalCase, value.hits, noGoodMatch, ms));
    const mark = searchMetrics.at(-1)?.hitAt1 ? "ok" : "miss";
    const coverage = value.hits[0]?.coverage;
    const flag = noGoodMatch ? " abstain" : "";
    process.stderr.write(
      `${mark}\t${evalCase.id}\t${ms}ms\tcov=${coverage ?? "-"}${flag}\t${value.hits[0]?.url ?? "(none)"}\n`,
    );
  }

  const pageMetrics: PageMetric[] = [];
  const pageCases = offline ? [] : suite.pages;
  for (const check of pageCases) {
    const { value, ms } = await time(() =>
      getPage(
        {
          url: check.url,
          maxChars: check.maxChars,
          query: check.query,
          section: check.section,
        } as Parameters<typeof getPage>[0],
        fetchText,
      ),
    );
    const imageOnly = (value as { imageOnly?: boolean }).imageOnly;
    const judged = pagePass(value.markdown, imageOnly, check);
    pageMetrics.push({ id: check.id, pass: judged.pass, ms, reason: judged.reason, imageOnly });
    process.stderr.write(`${judged.pass ? "ok" : "miss"}\tpage:${check.id}\t${ms}ms\t${judged.reason}\n`);
  }

  const search = summarize(searchMetrics);
  const pagePasses = pageMetrics.filter((item) => item.pass).length;
  const report = {
    generatedAt: new Date().toISOString(),
    cacheDir: process.env.RDK_DOCS_CACHE_DIR,
    prebuilt: process.env.RDK_DOCS_PREBUILT ?? "default",
    offline,
    latency: {
      coldSearchMs: cold.ms,
      warmSearchMs: warm.ms,
      scopedSearchMs: scoped.ms,
      forumSearchMs: offline ? null : forum.ms,
      coldTop: cold.value.hits[0]?.url ?? null,
      forumTop: forum.value.hits[0]?.title ?? null,
    },
    search: {
      n: search.n,
      hitAt1: round(search.hitAt1),
      hitAt3: round(search.hitAt3),
      mrr: round(search.mrr),
      meanMs: Math.round(search.meanMs),
      p95Ms: Math.round(search.p95Ms),
    },
    pages: {
      n: pageMetrics.length,
      pass: pagePasses,
      passRate: pageMetrics.length ? round(pagePasses / pageMetrics.length) : 0,
    },
    cases: searchMetrics,
    pageCases: pageMetrics,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `hit@1 ${report.search.hitAt1}  hit@3 ${report.search.hitAt3}  MRR ${report.search.mrr}  ` +
      `pages ${pagePasses}/${pageMetrics.length}  cold ${cold.ms}ms warm ${warm.ms}ms scoped ${scoped.ms}ms p95 ${Math.round(search.p95Ms)}ms forum ${forum.ms}ms\n` +
      `wrote ${outPath}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`eval failed: ${message}\n`);
  process.exit(1);
});
