import { parse, type HTMLElement, type Node, type TextNode } from "node-html-parser";
import { origin } from "./catalog.js";

const ALLOWED_HOSTS = new Set(["developer.d-robotics.cc", "forum.d-robotics.cc"]);

export function resolveDocUrl(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  const absolute = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `${origin()}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    throw new Error(`Invalid URL: ${urlOrPath}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error("Only developer.d-robotics.cc and forum.d-robotics.cc URLs are allowed.");
  }
  return parsed.toString();
}

export function htmlToMarkdown(html: string, url: string): { title: string; url: string; markdown: string } {
  const root = parse(html);
  const article =
    root.querySelector(".theme-doc-markdown") ??
    root.querySelector("article") ??
    root.querySelector(".document") ??
    root.querySelector("main") ??
    root.querySelector("body");

  if (!article) {
    return { title: url, url, markdown: "" };
  }

  const heading = article.querySelector("h1");
  const title = cleanText(heading?.text || root.querySelector("title")?.text || url);
  const markdown = cleanText(renderNodes(article.childNodes)).trim();
  return { title, url, markdown };
}

function cleanText(text: string): string {
  return text.replace(/\u200b/g, "").replace(/[ \t]+\n/g, "\n");
}

function renderNodes(nodes: Node[]): string {
  return nodes.map((node) => renderNode(node)).join("").replace(/\n{3,}/g, "\n\n");
}

function renderNode(node: Node): string {
  if (node.nodeType === 3) {
    return (node as TextNode).text.replace(/\s+/g, " ");
  }
  if (!("tagName" in node) || !(node as HTMLElement).tagName) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = renderNodes(el.childNodes).trim();

  switch (tag) {
    case "h1":
      return `\n# ${inner}\n\n`;
    case "h2":
      return `\n## ${inner}\n\n`;
    case "h3":
      return `\n### ${inner}\n\n`;
    case "h4":
      return `\n#### ${inner}\n\n`;
    case "p":
      return `${inner}\n\n`;
    case "pre":
      return `\n\`\`\`\n${el.text.trim()}\n\`\`\`\n\n`;
    case "code":
      return el.parentNode && (el.parentNode as HTMLElement).tagName?.toLowerCase() === "pre"
        ? el.text
        : `\`${inner}\``;
    case "li":
      return `- ${inner}\n`;
    case "ul":
    case "ol":
      return `\n${inner}\n`;
    case "br":
      return "\n";
    case "script":
    case "style":
    case "nav":
      return "";
    default:
      return inner ? `${inner}` : "";
  }
}
