import { describe, expect, it } from "vitest";
import { dedupeMirrorPages, fillPageBodies, preferredPageUrls } from "./mirror-pages.js";
import type { IndexedDoc } from "./types.js";

const page = (url: string, text: string): IndexedDoc => ({
  manualId: "rdk-ultra",
  title: url,
  url,
  kind: "page",
  text,
});

describe("duplicate manual paths", () => {
  it("drops the longer copy when the text matches and keeps a page whose text differs", () => {
    const shared = "decoder registers and the buffer size";
    const docs = [
      page("https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/cdev/decoder_api", shared),
      page("https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/multi_media_api/cdev/decoder_api", shared),
      page("https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/cdev/bpu_api", "bpu queue depth is eight"),
      page("https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/multi_media_api/cdev/bpu_api", "bpu queue depth is nine"),
      {
        manualId: "rdk-ultra",
        title: "寄存器",
        url: "https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/multi_media_api/cdev/decoder_api#reg",
        kind: "heading" as const,
        text: "寄存器",
      },
    ];
    const kept = dedupeMirrorPages(docs);
    const urls = kept.map((doc) => doc.url);
    expect(urls).toContain("https://developer.d-robotics.cc/rdk_doc/RDK_Ultra/cdev/decoder_api");
    expect(urls.some((url) => url.includes("multi_media_api/cdev/decoder"))).toBe(false);
    expect(urls.filter((url) => url.includes("bpu_api"))).toHaveLength(2);
  });

  it("fetches the slashed https page and keeps the longer body", async () => {
    const docs = [page("https://developer.d-robotics.cc/rdk_doc/Quick_start/install_os/rdk_ultra", "烧录准备")];
    expect(preferredPageUrls(docs[0]!.url)).toEqual([
      "https://developer.d-robotics.cc/rdk_doc/Quick_start/install_os/rdk_ultra/",
    ]);
    const html = `<html><body><article class="theme-doc-markdown"><h1>安装</h1><p>${"供电与烧录步骤。".repeat(40)}</p></article></body></html>`;
    const filled = await fillPageBodies(docs, async (url) => {
      if (!url.endsWith("/")) throw new Error(`unstripped ${url}`);
      return html;
    });
    expect(filled[0]?.text?.length ?? 0).toBeGreaterThan(100);
    expect(filled[0]?.text).toContain("供电与烧录步骤");
  });
});
