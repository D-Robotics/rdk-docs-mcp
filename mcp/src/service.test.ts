import { describe, expect, it } from "vitest";
import { getPage, listToc, searchDocs } from "./service.js";
import type { HttpGet } from "./http.js";

const docusaurusIndex = JSON.stringify([
  {
    documents: [
      {
        t: "PoE 供电使用",
        u: "/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE",
        b: ["7 进阶开发"],
      },
    ],
  },
]);

const html = `
  <article class="theme-doc-markdown">
    <h1>PoE 供电使用</h1>
    <p>电压与功率因标准而异。</p>
  </article>
`;

const http: HttpGet = async (url: string) => {
  if (url.endsWith("search-index.json")) return docusaurusIndex;
  if (url.includes("/POE")) return html;
  throw new Error(`unexpected url ${url}`);
};

describe("searchDocs", () => {
  it("searches a docusaurus manual and reports manuals without an index", async () => {
    const result = await searchDocs({ query: "PoE", manual: "x5", limit: 5 }, http);
    expect(result.hits[0]?.title).toMatch(/PoE/);
    expect(result.hits[0]?.url).toContain("developer.d-robotics.cc");
    expect(result.warnings).toEqual([]);
  });

  it("warns when the selected manual has no search index", async () => {
    const result = await searchDocs({ query: "量化", manual: "oe-s" }, http);
    expect(result.hits).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/oe-s/);
  });
});

describe("listToc", () => {
  it("lists page titles from the docusaurus page shard", async () => {
    const toc = await listToc({ manual: "rdk-x" }, http);
    expect(toc.pages[0]?.title).toBe("PoE 供电使用");
  });
});

describe("getPage", () => {
  it("returns markdown for an allowed documentation URL", async () => {
    const page = await getPage(
      { url: "https://developer.d-robotics.cc/rdk_x_doc/Advanced_development/hardware_development/rdk_x5/POE" },
      http,
    );
    expect(page.title).toBe("PoE 供电使用");
    expect(page.markdown).toContain("电压与功率");
  });
});
