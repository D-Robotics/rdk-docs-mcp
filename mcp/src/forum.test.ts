import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compactDiscourseSearch,
  compactDiscourseTopicList,
  forumHitsFromDocs,
  forumListing,
  forumTopicJsonUrl,
  parseForumCategoryId,
  parseForumTopicId,
  topicToMarkdown,
} from "./forum.js";

const searchFixture = {
  topics: [
    {
      id: 33210,
      title: "RDK S100没有wifi",
      slug: "topic",
      tags: ["rdx-s100"],
      posts_count: 3,
    },
  ],
  posts: [
    {
      id: 56136,
      topic_id: 33210,
      username: "RiChouu",
      blurb: "rdk s100右上角设置无wifi图标，且搜索不到wifi设备。",
    },
  ],
};

const topicFixture = {
  id: 33210,
  title: "RDK S100没有wifi",
  slug: "topic",
  tags: ["rdx-s100"],
  post_stream: {
    posts: [
      {
        post_number: 1,
        username: "RiChouu",
        cooked: "<p>右上角没有 wifi 图标。</p><pre><code>iwconfig</code></pre>",
      },
      {
        post_number: 2,
        username: "helper",
        cooked: "<p>先确认模组是否被识别。</p>",
      },
    ],
  },
};

describe("forumListing", () => {
  it("marks forum as Discourse-backed, not a missing docs index", () => {
    const listing = forumListing();
    expect(listing.id).toBe("forum");
    expect(listing.indexKind).toBe("discourse");
    expect(listing.searchable).toBe(true);
    expect(listing.note).toMatch(/不是手册 search-index/);
    expect(listing.note).toMatch(/不要暂停/);
    expect(listing.note).toMatch(/\/search\.json/);
  });
});

describe("rdk-docs skill", () => {
  it("sends agents to public Discourse JSON instead of forum HTML", () => {
    const skill = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "rdk-docs", "SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("https://forum.d-robotics.cc/search.json?q=");
    expect(skill).toContain("https://forum.d-robotics.cc/t/{id}.json");
    expect(skill).toContain("https://forum.d-robotics.cc/c/kai-fa-yu-wen-ti/39/l/latest.json");
    expect(skill).toContain("不要说「社区目录未加载");
    expect(skill).toContain("**不要**打开");
    expect(skill).not.toMatch(/也不要自己请求 `forum\.d-robotics\.cc`/);
  });
});

describe("compactDiscourseSearch", () => {
  it("turns Discourse search topics into official forum URLs", () => {
    const docs = compactDiscourseSearch(searchFixture);
    expect(docs[0]?.title).toBe("RDK S100没有wifi");
    expect(docs[0]?.url).toBe("https://forum.d-robotics.cc/t/topic/33210");
    expect(docs[0]?.manualId).toBe("forum");
    expect(docs[0]?.snippet).toMatch(/wifi/);
    expect(docs[0]?.breadcrumbs).toEqual(["rdx-s100"]);
  });
});

describe("forum topic URLs", () => {
  it("extracts topic ids from common Discourse paths", () => {
    expect(parseForumTopicId("https://forum.d-robotics.cc/t/33210")).toBe(33210);
    expect(parseForumTopicId("https://forum.d-robotics.cc/t/topic/33210")).toBe(33210);
    expect(parseForumTopicId("https://forum.d-robotics.cc/t/rdk-s100/33210/2")).toBe(33210);
    expect(parseForumTopicId("https://developer.d-robotics.cc/rdk_x_doc/RDK")).toBeUndefined();
  });

  it("extracts Discourse category ids from board paths the agent actually opens", () => {
    expect(parseForumCategoryId("https://forum.d-robotics.cc/c/39-category/yykf/7")).toBe(7);
    expect(parseForumCategoryId("https://forum.d-robotics.cc/c/39-category/15-category/15")).toBe(15);
    expect(parseForumCategoryId("https://forum.d-robotics.cc/c/7/l/latest.json")).toBe(7);
    expect(parseForumCategoryId("https://forum.d-robotics.cc/t/topic/33210")).toBeUndefined();
  });

  it("maps a topic URL to its JSON endpoint", () => {
    expect(forumTopicJsonUrl("https://forum.d-robotics.cc/t/topic/33210")).toBe(
      "https://forum.d-robotics.cc/t/33210.json",
    );
  });
});

describe("compactDiscourseTopicList", () => {
  it("reads a board latest.json and skips the category intro pin", () => {
    const docs = compactDiscourseTopicList(
      {
        topic_list: {
          topics: [
            { id: 1, title: "关于“开发与问题”类别", slug: "topic", pinned: true },
            {
              id: 35610,
              title: "yolo模型量化精度问题",
              slug: "topic",
              tags: ["求助帖"],
              excerpt: "量化后精度掉了很多",
            },
          ],
        },
      },
      "开发与问题",
    );
    expect(docs.map((doc) => doc.title)).toEqual(["yolo模型量化精度问题"]);
    expect(docs[0]?.url).toBe("https://forum.d-robotics.cc/t/topic/35610");
    expect(docs[0]?.breadcrumbs).toEqual(["开发与问题", "求助帖"]);
  });
});

describe("forumHitsFromDocs", () => {
  it("keeps Discourse search hits that our keyword ranker would drop", () => {
    const searchHits = compactDiscourseSearch({
      topics: [{ id: 9, title: "S100连接摄像头稳定掉线", slug: "topic" }],
      posts: [{ topic_id: 9, blurb: "摄像头偶发断流" }],
    });
    const boards = compactDiscourseTopicList(
      {
        topic_list: {
          topics: [{ id: 99, title: "欢迎试用新活动", slug: "topic" }],
        },
      },
      "通用",
    );
    const hits = forumHitsFromDocs([...searchHits, ...boards], "帧率 FIFO", 5, searchHits);
    expect(hits.map((hit) => hit.url)).toEqual(["https://forum.d-robotics.cc/t/topic/9"]);
    expect(hits[0]?.source).toBe("forum");
  });
});

describe("topicToMarkdown", () => {
  it("renders title, tags, and cooked posts as Markdown", () => {
    const page = topicToMarkdown(topicFixture, "https://forum.d-robotics.cc/t/topic/33210");
    expect(page.title).toBe("RDK S100没有wifi");
    expect(page.markdown).toContain("# RDK S100没有wifi");
    expect(page.markdown).toContain("rdx-s100");
    expect(page.markdown).toContain("@RiChouu");
    expect(page.markdown).toContain("iwconfig");
    expect(page.markdown).toContain("@helper");
  });
});
