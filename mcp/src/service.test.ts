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

const rspressHome = `
  <html>
    <head>
      <meta name="generator" content="Rspress v1.23.1" />
      <title>Rspress</title>
      <script src="/oe_s_doc/static/js/lib-react.abc.js"></script>
      <script src="/oe_s_doc/static/js/4778.hash.js"></script>
    </head>
    <body><div id="__rspress_root"></div></body>
  </html>
`;

const rspressBundle = `
  tn="search_index";
  var B={Z:{"###zh":"3e2be0d7","###en":"f110b174"}};
`;

const rspressZhIndex = JSON.stringify([
  {
    title: "BEV多任务模型训练",
    content: "BEV参考算法基于 Horizon Torch。量化后可以部署到板端。",
    routePath: "/oe_s_doc/guide/advanced_content/hat/examples/bev",
    lang: "zh",
    toc: [{ text: "训练流程", id: "训练流程", depth: 2 }],
  },
]);

const http: HttpGet = async (url: string) => {
  if (url.endsWith("search-index.json")) return docusaurusIndex;
  if (url.includes("/POE")) return html;
  if (url.includes("/oe_s_doc/static/js/lib-react")) {
    throw new Error("vendor bundle should not be fetched");
  }
  if (url.includes("/oe_s_doc/static/js/4778.hash.js")) return rspressBundle;
  if (url.endsWith("/oe_s_doc/static/search_index.zh.3e2be0d7.json")) return rspressZhIndex;
  if (url.endsWith("/oe_s_doc/static/search_index.en.f110b174.json")) return "[]";
  if (url.includes("/oe_s_doc")) return rspressHome;
  throw new Error(`unexpected url ${url}`);
};

describe("searchDocs", () => {
  it("searches a docusaurus manual", async () => {
    const result = await searchDocs({ query: "PoE", manual: "x5", limit: 5 }, http);
    expect(result.hits[0]?.title).toMatch(/PoE/);
    expect(result.hits[0]?.url).toContain("developer.d-robotics.cc");
    expect(result.warnings).toEqual([]);
  });

  it("discovers the Rspress search_index for S 系列 OE", async () => {
    const result = await searchDocs({ query: "量化", manual: "oe-s" }, http);
    expect(result.hits[0]?.title).toMatch(/BEV/);
    expect(result.hits[0]?.url).toContain("/oe_s_doc/guide/advanced_content/hat/examples/bev");
    expect(result.warnings).toEqual([]);
  });
});

describe("listToc", () => {
  it("lists page titles from the docusaurus page shard", async () => {
    const toc = await listToc({ manual: "rdk-x" }, http);
    expect(toc.pages[0]?.title).toBe("PoE 供电使用");
  });

  it("lists Rspress OE-S pages from the discovered index", async () => {
    const toc = await listToc({ manual: "oe-s" }, http);
    expect(toc.pages.map((page) => page.title)).toContain("BEV多任务模型训练");
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

  it("reads Rspress CSR pages from the search index instead of the empty shell", async () => {
    const page = await getPage(
      { url: "https://developer.d-robotics.cc/oe_s_doc/guide/advanced_content/hat/examples/bev" },
      http,
    );
    expect(page.title).toBe("BEV多任务模型训练");
    expect(page.markdown).toContain("Horizon Torch");
  });
});
