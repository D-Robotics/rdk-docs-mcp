import { parse, type HTMLElement, type Node } from "node-html-parser";
import { origin } from "./catalog.js";

const ALLOWED_HOSTS = new Set(["developer.d-robotics.cc", "forum.d-robotics.cc"]);

export function resolveDocUrl(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  const absolute = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `${origin()}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;

  let parsed: URL;
  try {
    parsed = new URL(absolute);
  } catch {
    throw new Error(`Invalid URL: ${urlOrPath}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error("Only developer.d-robotics.cc and forum.d-robotics.cc URLs are allowed.");
  return parsed.toString();
}

export function isDocusaurusShell(html: string, markdown: string): boolean {
  const docusaurusMarker =
    html.includes("theme-doc-markdown") || /RDK (?:X3\/X5|S100\/S600) DOC/i.test(html);
  if (!docusaurusMarker) return false;
  const compact = markdown.replace(/\s+/g, " ").trim();
  const body = markdown.replace(/^\s*#\s+[^\n]+\s*/, "").replace(/\s+/g, " ").trim();
  if (body.length > 0 && /^#\s+\S/.test(compact)) return false;
  return compact.length < 200;
}

export function htmlToMarkdown(html: string, url: string): { title: string; url: string; markdown: string } {
  const root = parse(html, { blockTextElements: { script: true, style: true, noscript: true } });
  const article = root.querySelector(".theme-doc-markdown") ?? root.querySelector("article") ?? root.querySelector(".document") ?? root.querySelector("main") ?? root.querySelector("body");
  if (!article)
    return { title: url, url, markdown: "" };

  const heading = article.querySelector("h1");
  const title = cleanText(heading?.text || root.querySelector("title")?.text || url);
  return { title, url, markdown: cleanText(renderNodes(article.childNodes, url)).trim() };
}

function cleanText(text: string): string { return text.replace(/[\u0000\u200b]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"); }

function codeText(node: Node): string {
  if (node.nodeType === 3)
    return node.text;
  if (!("tagName" in node))
    return "";
  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (tag === "br")
    return "\n";
  if (tag === "code")
    return el.childNodes.map(codeText).join("");
  if (["script", "style", "button"].includes(tag))
    return "";
  return el.childNodes.map(codeText).join("");
}

function renderNodes(nodes: Node[], url: string): string { return nodes.map((node) => renderNode(node, url)).join(""); }

function absoluteResource(value: string | undefined, base: string): string | undefined {
  if (!value)
    return undefined;
  try {
    const parsed = new URL(value, base);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? parsed.href : undefined;
  }
  catch {
    return undefined;
  }
}

function renderNode(node: Node, url: string): string {
  if (node.nodeType === 3)
    return node.text.replace(/\s+/g, " ");
  if (!("tagName" in node) || !node.tagName)
    return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (["script", "style", "nav", "button", "svg"].includes(tag))
    return "";
  if (tag === "pre") {
    const text = codeText(el).trim();
    return `\n\`\`\`\n${text}\n\`\`\`\n\n`;
  }
  if (tag === "img") {
    const src = absoluteResource(el.getAttribute("src"), url);
    return src ? `![${el.getAttribute("alt") ?? ""}](${src})` : "";
  }
  const content = renderNodes(el.childNodes, url);
  const inner = content.trim();
  const scope = el.getAttribute("data-doc-scope");
  if (scope) {
    try {
      const products = JSON.parse(scope).products;
      if (Array.isArray(products) && products.length)
        return `\n**${products.join(" / ")}**\n\n${inner}\n\n`;
    }
    catch { /* keep body */ }
  }
  if (tag === "a") {
    const href = absoluteResource(el.getAttribute("href"), url);
    return href ? `[${inner}](${href})` : inner;
  }
  if (tag === "tabitem" || el.getAttribute("role") === "tabpanel") {
    const label = el.getAttribute("label") ?? el.getAttribute("value");
    return `\n${label ? `**${label}**\n\n` : ""}${inner}\n\n`;
  }
  switch (tag) {
    case "h1": return `\n# ${inner}\n\n`;
    case "h2": return `\n## ${inner}\n\n`;
    case "h3": return `\n### ${inner}\n\n`;
    case "h4": return `\n#### ${inner}\n\n`;
    case "p": return `${inner}\n\n`;
    case "code": return `\`${codeText(el)}\``;
    case "li": return `- ${inner}\n`;
    case "ul":
    case "ol": return `\n${inner}\n`;
    case "br": return "\n";
    case "table": {
      const rows = el.querySelectorAll("tr").map((row) => row.querySelectorAll("th,td").map((cell) => renderNodes(cell.childNodes, url).trim()));
      const lines = rows.map((row) => `| ${row.join(" | ")} |`);
      if (lines.length)
        lines.splice(1, 0, `| ${rows[0].map(() => "---").join(" | ")} |`);
      return `\n${lines.join("\n")}\n\n`;
    }
    default: return content;
  }
}
