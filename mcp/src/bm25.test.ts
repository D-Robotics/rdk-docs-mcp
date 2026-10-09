import { describe, expect, it } from "vitest";
import { manualMatchesBoards } from "./bm25.js";
import { matchQuality, rankHits } from "./search.js";
import type { IndexedDoc } from "./types.js";

function doc(partial: Partial<IndexedDoc> & Pick<IndexedDoc, "title" | "url">): IndexedDoc {
  return { manualId: "rdk-x", kind: "page", ...partial };
}

describe("bm25", () => {
  it("ranks a title match above the same words buried in the body", () => {
    const hits = rankHits(
      [
        doc({
          title: "其他说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/other",
          text: "烧录 烧录 烧录 烧录",
        }),
        doc({ title: "系统烧录", url: "https://developer.d-robotics.cc/rdk_x_doc/flash" }),
      ],
      "烧录",
      5,
    );
    expect(hits[0]?.title).toBe("系统烧录");
  });

  it("matches an identifier with the underscores removed", () => {
    const hits = rankHits(
      [doc({ title: "hobot_dnn 推理", url: "https://developer.d-robotics.cc/rdk_x_doc/hobot_dnn" })],
      "hobotdnn",
      3,
    );
    expect(hits[0]?.url).toContain("hobot_dnn");
    expect(hits[0]?.quality).toBe("good");
  });

  it("drops an S-series OE page when the query names X5", () => {
    const hits = rankHits(
      [
        doc({
          manualId: "oe-s",
          title: "Docker 示例",
          url: "https://developer.d-robotics.cc/oe_s_doc/en/guide/docker",
          text: "docker iptables",
        }),
        doc({
          manualId: "rdk-x",
          title: "X5 快速开始",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/rdk_x5",
          text: "RDK X5",
        }),
      ],
      "x5 docker",
      5,
    );
    expect(hits.some((hit) => hit.manual === "oe-s")).toBe(false);
  });

  it("abstains when the query shares no real terms with the corpus", () => {
    const docs = [doc({ title: "GPIO 应用", url: "https://developer.d-robotics.cc/rdk_x_doc/gpio", text: "40pin 电平" })];
    const query = "excel 数据透视表怎么做";
    const hits = rankHits(docs, query, 5);
    const quality = matchQuality(hits, [docs], query);
    expect(quality.noGoodMatch).toBe(true);
    expect(quality.confidence).toBeGreaterThanOrEqual(0);
    expect(quality.confidence).toBeLessThanOrEqual(1);
  });

  it("does not abstain on colloquial wording or ordinary error prose", () => {
    const docs = [doc({ title: "GPIO 应用", url: "https://developer.d-robotics.cc/rdk_x_doc/gpio", text: "40pin 电平" })];
    for (const query of ["特斯拉刹车片怎么换", "The repository is not signed", "怎么把系统烧录一下，老是失败"]) {
      expect(matchQuality(rankHits(docs, query, 5), [docs], query).noGoodMatch).toBe(false);
    }
  });

  it("abstains only when a command token is missing from the corpus and the top hit", () => {
    const docs = [doc({ title: "GPIO 应用", url: "https://developer.d-robotics.cc/rdk_x_doc/gpio", text: "40pin 电平" })];
    const missing = "nginx 反代一直 502";
    expect(matchQuality(rankHits(docs, missing, 5), [docs], missing).noGoodMatch).toBe(true);
    const documented = [
      doc({
        title: "nginx 反向代理",
        url: "https://developer.d-robotics.cc/rdk_x_doc/nginx",
        text: "nginx 配置",
      }),
    ];
    const present = "nginx 怎么反代";
    expect(matchQuality(rankHits(documented, present, 5), [documented], present).noGoodMatch).toBe(false);
  });

  it("does not abstain when a typo of a documented command is the query", () => {
    const docs = [doc({ title: "V4L2 使用", url: "https://developer.d-robotics.cc/rdk_x_doc/v4l2", text: "v4l2 节点" })];
    const query = "v4l2ctl 列不出节点";
    const hits = rankHits(docs, query, 3);
    expect(matchQuality(hits, [docs], query).noGoodMatch).toBe(false);
  });

  it("does not abstain when filler words miss but a distinctive term is in the corpus", () => {
    const hits = rankHits(
      [doc({ title: "系统烧录", url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/system-burn" })],
      "怎么把系统烧录一下，老是失败",
      5,
    );
    const quality = matchQuality(hits);
    expect(quality.noGoodMatch).toBe(false);
    expect(hits[0]?.confidence).toBeGreaterThan(0.4);
  });

  it("prefers a guide over a command page for a how-to", () => {
    const hits = rankHits(
      [
        doc({
          title: "烧录命令",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Appendix/linux-command-manual/cmd_dd",
          text: "烧录 镜像到 sd 卡",
        }),
        doc({
          title: "烧录指南",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/system-burn",
          text: "烧录 镜像到 sd 卡",
        }),
      ],
      "镜像怎么烧录到卡上",
      5,
    );
    expect(hits[0]?.url).toContain("system-burn");
  });

  it("downranks a long multi-topic section against a short guide", () => {
    const broad = `humble 安装说明。${"这是另一个问题？".repeat(12)}${"填充内容用于拉长这一节。".repeat(40)}`;
    const hits = rankHits(
      [
        doc({
          title: "Humble 说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/tros",
          text: broad,
        }),
        doc({
          title: "Humble 说明",
          url: "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/install",
          text: "安装步骤",
        }),
      ],
      "humble 怎么安装",
      5,
    );
    expect(hits[0]?.url).toContain("Quick_start/install");
  });

  it("lets a rare token beat a title full of generic collision words", () => {
    const filler = Array.from({ length: 24 }, (_, i) =>
      doc({
        title: `note ${i}`,
        url: `https://developer.d-robotics.cc/rdk_x_doc/note-${i}`,
        text: "docker error static ip",
      }),
    );
    const hits = rankHits(
      [
        ...filler,
        doc({
          title: "docker error",
          url: "https://developer.d-robotics.cc/rdk_x_doc/FAQ/docker-error",
          text: "error docker static",
        }),
        doc({
          title: "网络配置",
          url: "https://developer.d-robotics.cc/rdk_x_doc/System_configuration/iptables",
          text: "iptables",
        }),
      ],
      "docker error iptables",
      5,
    );
    expect(hits[0]?.url).toContain("iptables");
  });

  it("keeps one hit from each board when the query names neither", () => {
    const hits = rankHits(
      [
        doc({
          title: "BPU API",
          url: "https://developer.d-robotics.cc/rdk_x_doc/RDK_X3/bpu_api",
          text: "BPU inference",
        }),
        doc({
          title: "BPU API",
          url: "https://developer.d-robotics.cc/rdk_x_doc/RDK_X5/bpu_api",
          text: "BPU inference",
        }),
      ],
      "BPU inference",
      5,
    );
    expect(hits[0]?.board).not.toBe(hits[1]?.board);
    expect(hits.map((hit) => hit.board).sort()).toEqual(["x3", "x5"]);
  });

  it("blocks S-series manuals for an X-only board and the reverse", () => {
    expect(manualMatchesBoards("oe-s", ["x5"])).toBe(false);
    expect(manualMatchesBoards("oe-x5", ["x5"])).toBe(true);
    expect(manualMatchesBoards("oe-x5", ["x3"])).toBe(false);
    expect(manualMatchesBoards("oe-x3", ["x3"])).toBe(true);
    expect(manualMatchesBoards("rdk-x", ["s100"])).toBe(false);
    expect(manualMatchesBoards("tros", ["x3"])).toBe(true);
    expect(manualMatchesBoards("oe-s", ["x5", "s100"])).toBe(true);
  });
});
