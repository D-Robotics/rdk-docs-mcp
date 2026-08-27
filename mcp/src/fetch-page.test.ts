import { describe, expect, it } from "vitest";
import { htmlToMarkdown, isDocusaurusShell, resolveDocUrl } from "./fetch-page.js";

describe("resolveDocUrl", () => {
  it("accepts absolute and site-relative d-robotics URLs", () => {
    expect(resolveDocUrl("https://developer.d-robotics.cc/rdk_x_doc/RDK")).toBe(
      "https://developer.d-robotics.cc/rdk_x_doc/RDK",
    );
    expect(resolveDocUrl("/rdk_x_doc/RDK")).toBe(
      "https://developer.d-robotics.cc/rdk_x_doc/RDK",
    );
  });

  it("rejects URLs outside the documentation and forum hosts", () => {
    expect(() => resolveDocUrl("https://example.com/secret")).toThrow(/developer\.d-robotics\.cc/);
  });

  it("accepts official forum topic URLs", () => {
    expect(resolveDocUrl("https://forum.d-robotics.cc/t/topic/33210")).toBe(
      "https://forum.d-robotics.cc/t/topic/33210",
    );
  });
});

describe("htmlToMarkdown", () => {
  it("extracts the docusaurus article instead of the chrome", () => {
    const html = `
      <html>
        <body>
          <nav>导航应被丢掉</nav>
          <article class="theme-doc-markdown">
            <h1>PoE 供电使用</h1>
            <p>目前查阅到 PoE 有多种标准。</p>
            <pre><code>sudo ip link</code></pre>
          </article>
        </body>
      </html>
    `;
    const page = htmlToMarkdown(html, "https://developer.d-robotics.cc/rdk_x_doc/poe");
    expect(page.title).toBe("PoE 供电使用");
    expect(page.markdown).toContain("# PoE 供电使用");
    expect(page.markdown).toContain("多种标准");
    expect(page.markdown).toContain("```");
    expect(page.markdown).toContain("sudo ip link");
    expect(page.markdown).not.toContain("导航应被丢掉");
  });
});

describe("isDocusaurusShell", () => {
  it("flags an empty theme-doc-markdown article as a shell", () => {
    const html = `
      <html>
        <head><title>RDK X3/X5 DOC</title></head>
        <body><article class="theme-doc-markdown"></article></body>
      </html>
    `;
    const { markdown } = htmlToMarkdown(
      html,
      "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3",
    );
    expect(markdown.replace(/\s+/g, " ").trim().length).toBeLessThan(20);
    expect(isDocusaurusShell(html, markdown)).toBe(true);
  });

  it("flags a heading-only article as a shell", () => {
    const html = `
      <html>
        <head><title>RDK X3/X5 DOC</title></head>
        <body><article class="theme-doc-markdown"><h1>rdk_x3</h1></article></body>
      </html>
    `;
    const { markdown } = htmlToMarkdown(
      html,
      "https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x3",
    );
    expect(isDocusaurusShell(html, markdown)).toBe(true);
  });

  it("does not flag a real article with heading and paragraph", () => {
    const html = `
      <html>
        <body>
          <nav>导航应被丢掉</nav>
          <article class="theme-doc-markdown">
            <h1>PoE 供电使用</h1>
            <p>目前查阅到 PoE 有多种标准。</p>
            <pre><code>sudo ip link</code></pre>
          </article>
        </body>
      </html>
    `;
    const { markdown } = htmlToMarkdown(html, "https://developer.d-robotics.cc/rdk_x_doc/poe");
    expect(isDocusaurusShell(html, markdown)).toBe(false);
  });
});

