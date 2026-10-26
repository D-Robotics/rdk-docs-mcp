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

  const docs = names.map((name, index) => {
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
  attachIdentifierTerms(source, docs);
  return docs;
}

function usefulTerm(term: string): boolean {
  if (term.length < 4 || term.length > 64) return false;
  if (/^#+$/.test(term)) return false;
  return /[a-z]/i.test(term) && (/[0-9_]/.test(term) || term.length >= 10);
}

/** Sphinx emits a JS object, not JSON: some keys are unquoted (`_128:`). */
function quoteUnquotedKeys(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    if (inString) {
      out += ch;
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
      out += ch;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const prev = out.trimEnd().at(-1);
      if (prev === "{" || prev === ",") {
        let j = i;
        while (j < source.length && /[A-Za-z0-9_$.]/.test(source[j] ?? "")) j += 1;
        if (source[j] === ":") {
          out += `"${source.slice(i, j)}"`;
          i = j - 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

function termMap(source: string, key: string): Record<string, number | number[]> | undefined {
  try {
    const extracted = extractJsonValue(source, key);
    if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
      return extracted as Record<string, number | number[]>;
    }
  } catch {
    // Real searchindex.js objects are not strict JSON. Fall through.
  }
  for (const needle of [`"${key}":`, `${key}:`]) {
    const idx = source.indexOf(needle);
    if (idx === -1) continue;
    let i = idx + needle.length;
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
    if (source[i] !== "{") continue;
    try {
      const parsed = JSON.parse(quoteUnquotedKeys(sliceBalanced(source, i, "{", "}"))) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, number | number[]>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function attachIdentifierTerms(source: string, docs: IndexedDoc[]): void {
  const terms = termMap(source, "terms");
  if (!terms) return;
  const buckets = new Map<number, string[]>();
  const ranked = Object.keys(terms).filter(usefulTerm).sort((a, b) => Number(b.includes("_")) - Number(a.includes("_")));
  for (const term of ranked) {
    const value = terms[term];
    const ids = Array.isArray(value) ? value : [value];
    for (const id of ids) {
      if (typeof id !== "number" || id < 0 || id >= docs.length) continue;
      const list = buckets.get(id) ?? [];
      if (list.length >= 80) continue;
      list.push(term);
      buckets.set(id, list);
    }
  }
  for (const [id, words] of buckets) {
    const doc = docs[id];
    if (!doc) continue;
    doc.text = [doc.text, words.join(" ")].filter(Boolean).join("\n");
  }
}
