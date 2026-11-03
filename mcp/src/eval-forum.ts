import { inspectPage, scoreForumToc, type CaseScore, type ForumTocPage } from "./eval.js";

type ForumApi = {
  listToc: (input: { manual: "forum"; query?: string }) => Promise<{ pages: ForumTocPage[] }>;
  getPage: (url: string) => Promise<{ title: string; url: string; markdown: string }>;
};

function failure(id: string, question: string, error: unknown, searchPass = false): CaseScore {
  return {
    id,
    question,
    searchPass,
    pagePass: false,
    pass: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}

/** Keep independent forum checks running when one endpoint is unavailable. */
export async function evaluateForumChecks(api: ForumApi): Promise<CaseScore[]> {
  const results: CaseScore[] = [];
  let pages: ForumTocPage[] | undefined;
  try {
    pages = (await api.listToc({ manual: "forum" })).pages;
    const score = scoreForumToc(pages);
    results.push({ id: "forum-list-toc", question: "列出开发与问题和通用最近帖", searchPass: score.pass, pagePass: score.pass, pass: score.pass, reason: score.reason });
  } catch (error) {
    results.push(failure("forum-list-toc", "列出开发与问题和通用最近帖", error));
  }

  if (!pages?.[0]) {
    results.push(failure("forum-list-toc-page", "打开板块最近帖正文", "no topic available from forum listing"));
  } else {
    try {
      const topic = await api.getPage(pages[0].url);
      const pass = inspectPage(topic.markdown).valid && topic.url.includes("forum.d-robotics.cc");
      results.push({
        id: "forum-list-toc-page", question: "打开板块最近帖正文", searchPass: true, pagePass: pass, pass,
        hitUrl: topic.url, hitTitle: topic.title,
        reason: pass ? `opened ${topic.title}` : `empty or invalid topic page: ${pages[0].url}`,
      });
    } catch (error) {
      results.push(failure("forum-list-toc-page", "打开板块最近帖正文", error, true));
    }
  }

  try {
    const filtered = await api.listToc({ manual: "forum", query: "开发与问题" });
    const pass = filtered.pages.length > 0 && filtered.pages.every((page) => page.breadcrumbs?.[0] === "开发与问题");
    results.push({
      id: "forum-list-toc-filter", question: "按板块过滤论坛最近帖", searchPass: pass, pagePass: pass, pass,
      reason: pass ? `filtered to ${filtered.pages.length} topics on 开发与问题` : "forum toc query=开发与问题 did not stay on that board",
    });
  } catch (error) {
    results.push(failure("forum-list-toc-filter", "按板块过滤论坛最近帖", error));
  }
  return results;
}
