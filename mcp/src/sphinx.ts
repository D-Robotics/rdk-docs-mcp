import { origin } from "./catalog.js";
import type { IndexedDoc } from "./types.js";

function sliceBalanced(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error("Unbalanced searchindex.js value");
}

function extractJsonValue(source: string, key: string): unknown {
  for (const needle of [`"${key}":`, `${key}:`]) {
    const idx = source.indexOf(needle);
    if (idx === -1) continue;
    let i = idx + needle.length;
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
    const open = source[i];
    if (open !== "[" && open !== "{") continue;
    const close = open === "[" ? "]" : "}";
    return JSON.parse(sliceBalanced(source, i, open, close));
  }
  return undefined;
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function compactSphinxIndex(
  source: string,
  manualId: string,
  basePath: string,
): IndexedDoc[] {
  const names = extractJsonValue(source, "docnames");
  if (!Array.isArray(names)) {
    throw new Error("searchindex.js is missing a docnames array");
  }

  const rawTitles = extractJsonValue(source, "titles");
  const titleOf = (name: string, index: number): string => {
    if (Array.isArray(rawTitles)) return stripHtml(String(rawTitles[index] ?? name));
    if (rawTitles && typeof rawTitles === "object") {
      const record = rawTitles as Record<string, string>;
      return stripHtml(record[name] ?? record[String(index)] ?? name);
    }
    return name;
  };

  return names.map((name, index) => {
    const doc = String(name);
    const title = titleOf(doc, index);
    const suffix = doc === "index" ? "" : `${doc}.html`;
    const path = suffix
      ? `${basePath.replace(/\/$/, "")}/${suffix}`
      : `${basePath.replace(/\/$/, "")}/`;
    return {
      manualId,
      title,
      url: `${origin()}${path}`,
      kind: "page" as const,
    };
  });
}
