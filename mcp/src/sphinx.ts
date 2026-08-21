import { origin } from "./catalog.js";
import type { IndexedDoc } from "./types.js";

type SphinxIndex = {
  docnames?: string[];
  titles?: Record<string, string> | string[];
};

export function compactSphinxIndex(
  source: string,
  manualId: string,
  basePath: string,
): IndexedDoc[] {
  const jsonText = source
    .replace(/^\s*Search\.setIndex\(/, "")
    .replace(/\)\s*;?\s*$/, "");
  const parsed = JSON.parse(jsonText) as SphinxIndex;
  const names = parsed.docnames ?? [];
  const titles = parsed.titles ?? {};

  return names.map((name, index) => {
    const title = Array.isArray(titles)
      ? (titles[index] ?? name)
      : (titles[name] ?? name);
    const suffix = name === "index" ? "" : `${name}.html`;
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
