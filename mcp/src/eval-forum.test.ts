import { describe, expect, it, vi } from "vitest";
import { evaluateForumChecks } from "./eval-forum.js";

const filteredPages = [{ title: "项目讨论", url: "https://forum.d-robotics.cc/t/topic/1", breadcrumbs: ["开发与问题"] }];
const recentPages = Array.from({ length: 12 }, (_, index) => ({
  title: `topic ${index}`,
  url: `https://forum.d-robotics.cc/t/topic/${index + 1}`,
  breadcrumbs: [index < 6 ? "开发与问题" : "通用"],
}));

describe("live forum evaluation", () => {
  it("reports a listing outage and still runs the independent filtered check", async () => {
    const getPage = vi.fn();
    const results = await evaluateForumChecks({
      listToc: async ({ query }) => {
        if (!query) throw new Error("forum unavailable");
        return { pages: filteredPages };
      },
      getPage,
    });
    expect(results.map(({ id, pass }) => ({ id, pass }))).toEqual([
      { id: "forum-list-toc", pass: false },
      { id: "forum-list-toc-page", pass: false },
      { id: "forum-list-toc-filter", pass: true },
    ]);
    expect(results[0].reason).toContain("forum unavailable");
    expect(getPage).not.toHaveBeenCalled();
  });

  it("records a failed topic fetch without skipping the filtered check", async () => {
    const results = await evaluateForumChecks({
      listToc: async ({ query }) => ({ pages: query ? filteredPages : recentPages }),
      getPage: async () => { throw new Error("HTTP 404"); },
    });
    expect(results.map(({ pass }) => pass)).toEqual([true, false, true]);
    expect(results[1]).toMatchObject({ searchPass: true, pagePass: false });
    expect(results[1].reason).toContain("HTTP 404");
  });
});
