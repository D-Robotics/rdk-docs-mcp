import { describe, expect, it } from "vitest";
import {
  compactDiscourseSearch,
  forumTopicJsonUrl,
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

  it("maps a topic URL to its JSON endpoint", () => {
    expect(forumTopicJsonUrl("https://forum.d-robotics.cc/t/topic/33210")).toBe(
      "https://forum.d-robotics.cc/t/33210.json",
    );
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
