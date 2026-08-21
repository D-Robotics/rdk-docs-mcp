import { describe, expect, it } from "vitest";
import { origin } from "./catalog.js";
import {
  compactRspressIndex,
  normalizeDocPath,
  parseRspressIndexGroups,
  rspressAppBundleUrls,
  searchIndexFilename,
} from "./rspress.js";
import { rankHits } from "./search.js";

const bundle = `
  tn="search_index";
  var B={Z:{"###en":"f110b174","###zh":"3e2be0d7"}};
  fetch(\`/oe_s_doc/static/\${R.t6}\${i}\${a}.\${B.Z[n]}.json\`);
`;

const versionedBundle = `.Z={"latest###en":"eefd76c1","latest###zh":"c217a86a"}`;

describe("Rspress index discovery", () => {
  it("reads version/lang/hash groups from the theme bundle", () => {
    expect(parseRspressIndexGroups(bundle)).toEqual([
      { version: "", lang: "en", hash: "f110b174" },
      { version: "", lang: "zh", hash: "3e2be0d7" },
    ]);
    expect(parseRspressIndexGroups(versionedBundle)).toEqual([
      { version: "latest", lang: "en", hash: "eefd76c1" },
      { version: "latest", lang: "zh", hash: "c217a86a" },
    ]);
  });

  it("builds the hashed search_index filename the site itself fetches", () => {
    expect(searchIndexFilename({ version: "", lang: "zh", hash: "3e2be0d7" })).toBe(
      "search_index.zh.3e2be0d7.json",
    );
    expect(searchIndexFilename({ version: "latest", lang: "en", hash: "eefd76c1" })).toBe(
      "search_index.latest.en.eefd76c1.json",
    );
  });

  it("picks app JS bundles and skips vendor chunks", () => {
    const html = `
      <script src="/oe_s_doc/static/js/lib-react.57316932.js"></script>
      <script src="/oe_s_doc/static/js/styles.f8fd3db6.js"></script>
      <script src="/oe_s_doc/static/js/4778.7688d284.js"></script>
      <script src="/oe_s_doc/static/js/index.d20a6e45.js"></script>
    `;
    expect(rspressAppBundleUrls(html, origin())).toEqual([
      `${origin()}/oe_s_doc/static/js/4778.7688d284.js`,
      `${origin()}/oe_s_doc/static/js/index.d20a6e45.js`,
    ]);
  });
});

describe("compactRspressIndex", () => {
  const docs = compactRspressIndex(
    [
      {
        title: "BEV多任务模型训练",
        content: "BEV参考算法基于 Horizon Torch。量化后可以部署到板端。",
        routePath: "/oe_s_doc/guide/advanced_content/hat/examples/bev",
        lang: "zh",
        toc: [{ text: "训练流程", id: "训练流程", depth: 2 }],
      },
    ],
    "oe-s",
  );

  it("turns pages and headings into indexed docs with official URLs", () => {
    const page = docs.find((doc) => doc.kind === "page");
    expect(page?.title).toBe("BEV多任务模型训练");
    expect(page?.url).toBe(
      "https://developer.d-robotics.cc/oe_s_doc/guide/advanced_content/hat/examples/bev",
    );
    expect(page?.text).toContain("量化");
    expect(docs.some((doc) => doc.kind === "heading" && doc.title === "训练流程")).toBe(true);
  });

  it("lets body text match even when the title does not", () => {
    const hits = rankHits(docs, "量化", 5);
    expect(hits[0]?.url).toContain("/oe_s_doc/guide/advanced_content/hat/examples/bev");
  });
});

describe("normalizeDocPath", () => {
  it("treats .html, trailing slash, and absolute URLs as the same page", () => {
    expect(normalizeDocPath("https://developer.d-robotics.cc/oe_s_doc/guide/foo.html")).toBe(
      "/oe_s_doc/guide/foo",
    );
    expect(normalizeDocPath("/oe_s_doc/guide/foo/")).toBe("/oe_s_doc/guide/foo");
  });
});
