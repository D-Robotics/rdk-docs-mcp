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
      {
        t: "WiFi 配置",
        u: "/rdk_x_doc/Quick_start/wifi",
        b: ["快速开始"],
      },
      {
        t: "WiFi 天线",
        u: "/rdk_x_doc/Quick_start/wifi-antenna",
        b: ["快速开始"],
      },
      {
        t: "WiFi 排障",
        u: "/rdk_x_doc/Quick_start/wifi-troubleshoot",
        b: ["快速开始"],
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

const forumSearch = JSON.stringify({
  topics: [{ id: 33210, title: "RDK S100没有wifi", slug: "topic", tags: ["rdx-s100"] }],
  posts: [{ topic_id: 33210, username: "RiChouu", blurb: "rdk s100右上角设置无wifi图标，且搜索不到wifi设备。" }],
});

const forumTopic = JSON.stringify({
  id: 33210,
  title: "RDK S100没有wifi",
  slug: "topic",
  tags: ["rdx-s100"],
  post_stream: {
    posts: [{ post_number: 1, username: "RiChouu", cooked: "<p>右上角没有 wifi 图标。</p>" }],
  },
});

const boardDev = JSON.stringify({
  topic_list: {
    topics: [
      { id: 1, title: "关于“开发与问题”类别", slug: "topic", pinned: true },
      { id: 35610, title: "yolo模型量化精度问题", slug: "topic", tags: ["求助帖"] },
    ],
  },
});

const boardGeneral = JSON.stringify({
  topic_list: {
    topics: [
      { id: 2, title: "欢迎来到地瓜机器人社区！", slug: "topic", pinned: true },
      { id: 35500, title: "S100连接摄像头稳定掉线", slug: "topic", tags: ["rdx-s100"] },
    ],
  },
});

const http: HttpGet = async (url: string) => {
  if (url.includes("/search.json")) return forumSearch;
  if (url.includes("/c/kai-fa-yu-wen-ti/39/l/latest.json")) return boardDev;
  if (url.includes("/c/general/4/l/latest.json")) return boardGeneral;
  if (url.includes("/t/33210.json")) return forumTopic;
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
    const result = await searchDocs({ query: "量化", manual: "oe-s", source: "docs" }, http);
    expect(result.hits[0]?.title).toMatch(/BEV/);
    expect(result.hits[0]?.url).toContain("/oe_s_doc/guide/advanced_content/hat/examples/bev");
    expect(result.warnings).toEqual([]);
  });

  it("searches the official forum when asked", async () => {
    const result = await searchDocs({ query: "S100 wifi", manual: "forum" }, http);
    expect(result.hits[0]?.source).toBe("forum");
    expect(result.hits[0]?.url).toBe("https://forum.d-robotics.cc/t/topic/33210");
    expect(result.hits[0]?.title).toMatch(/wifi/i);
  });

  it("mixes official docs and forum hits by default, with docs in the majority", async () => {
    const result = await searchDocs({ query: "wifi", limit: 5, source: "all" }, http);
    const docs = result.hits.filter((hit) => hit.source === "docs");
    const forum = result.hits.filter((hit) => hit.source === "forum");
    expect(result.hits[0]?.source).toBe("docs");
    expect(docs.length).toBeGreaterThanOrEqual(3);
    expect(forum.length).toBeGreaterThan(0);
    expect(docs.length).toBeGreaterThan(forum.length);
  });

  it("stays inside one manual when the caller names it", async () => {
    const result = await searchDocs({ query: "wifi", manual: "x5", limit: 5 }, http);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.every((hit) => hit.source === "docs")).toBe(true);
    expect(result.hits.every((hit) => hit.manual === "rdk-x")).toBe(true);
  });

  it("still finds board latest topics when Discourse search is empty", async () => {
    const emptySearch: HttpGet = async (url) => {
      if (url.includes("/search.json")) return JSON.stringify({ topics: [], posts: [] });
      return http(url);
    };
    const result = await searchDocs({ query: "量化", manual: "forum" }, emptySearch);
    expect(result.hits[0]?.url).toBe("https://forum.d-robotics.cc/t/topic/35610");
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

  it("lists recent topics from 开发与问题 and 通用", async () => {
    const toc = await listToc({ manual: "forum" }, http);
    expect(toc.pages.map((page) => page.title)).toEqual([
      "yolo模型量化精度问题",
      "S100连接摄像头稳定掉线",
    ]);
    expect(toc.pages[0]?.breadcrumbs).toContain("开发与问题");
    expect(toc.pages[1]?.breadcrumbs).toContain("通用");
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

  it("renders a Discourse topic from the forum JSON API", async () => {
    const page = await getPage({ url: "https://forum.d-robotics.cc/t/topic/33210" }, http);
    expect(page.title).toBe("RDK S100没有wifi");
    expect(page.markdown).toContain("@RiChouu");
    expect(page.markdown).toContain("wifi");
  });
});
