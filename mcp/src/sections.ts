import { rankHits } from "./search.js";
import type { IndexedDoc } from "./types.js";

export type SectionSlice = {
  markdown: string;
  matched: boolean;
  section?: string;
  anchor?: string;
  imageOnly: boolean;
  contentNotes: string[];
};

const HEADING = /^(#{1,6})\s+(.+)$/gm;

type Block = {
  level: number;
  title: string;
  anchor?: string;
  start: number;
  bodyStart: number;
};

function decodeAnchor(value: string): string {
  const raw = value.trim().replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function normalize(value: string): string {
  return decodeAnchor(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function headingTitle(raw: string): { title: string; anchor?: string } {
  const link = raw.match(/\[\]\(([^)]+)\)\s*$/);
  const title = raw.replace(/\[\]\([^)]+\)\s*$/, "").trim();
  const hash = link?.[1]?.split("#")[1];
  return { title, anchor: hash ? decodeAnchor(hash) : undefined };
}

function blocks(markdown: string): Block[] {
  const found: Block[] = [];
  for (const match of markdown.matchAll(HEADING)) {
    const start = match.index ?? 0;
    const parsed = headingTitle(match[2] ?? "");
    found.push({
      level: match[1]?.length ?? 1,
      title: parsed.title,
      anchor: parsed.anchor,
      start,
      bodyStart: start + match[0].length,
    });
  }
  return found;
}

function sectionText(markdown: string, block: Block, all: Block[]): string {
  const next = all.find((item) => item.start > block.start && item.level <= block.level);
  const end = next ? next.start : markdown.length;
  return markdown.slice(block.start, end).trim();
}

function scoreText(query: string, text: string): number {
  const lowered = text.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_.-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return lowered.includes(query.trim().toLowerCase()) ? 1 : 0;
  return tokens.reduce((score, token) => score + (lowered.includes(token) ? (token.length >= 4 ? 3 : 2) : 0), 0);
}

/** Text that belongs to this heading only, stopping at the next heading of any level. */
function immediateBody(markdown: string, block: Block, all: Block[]): string {
  const next = all.find((item) => item.start > block.start);
  const end = next ? next.start : markdown.length;
  return markdown.slice(block.bodyStart, end);
}

function sliceFromAnchor(markdown: string, anchor: string): { markdown: string; title: string } | undefined {
  const needle = normalize(anchor);
  if (needle.length < 2) return undefined;
  const lines = markdown.split("\n");
  let offset = 0;
  for (const line of lines) {
    const href = line.match(/#([^)\s]+)/);
    const hrefNorm = href ? normalize(href[1] ?? "") : "";
    if ((hrefNorm && (hrefNorm === needle || hrefNorm.includes(needle) || needle.includes(hrefNorm))) || normalize(line).includes(needle)) {
      const start = offset;
      const rest = markdown.slice(start);
      const next = rest.slice(1).search(/\n#{1,6}\s+/);
      const sliced = (next === -1 ? rest : rest.slice(0, next + 1)).trim();
      const title = line.replace(/\[\]\([^)]+\)/g, "").trim();
      return { markdown: sliced, title };
    }
    offset += line.length + 1;
  }
  return undefined;
}

const PIN_TOPIC = /管脚定义|引脚定义|接口定义|pin\s*map|40pin/i;

export function imageNotes(markdown: string): { imageOnly: boolean; contentNotes: string[] } {
  const images = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? "").filter(Boolean);
  const hasTable = /\n\|[^\n]+\|\n\|[\s:|-]+\|/.test(`\n${markdown}`);
  const aboutPins = PIN_TOPIC.test(markdown);
  const imageOnly = images.length >= 1 && aboutPins && !hasTable;
  if (!imageOnly) return { imageOnly: false, contentNotes: [] };
  const listed = images.slice(0, 6).map((src) => `- ${src}`).join("\n");
  const note = [
    "关键内容只在图片里，正文没有可引用的文字管脚表。请打开下面的官方图片，不要用其他型号的针脚表推断。",
    listed,
  ].join("\n");
  return { imageOnly: true, contentNotes: [note] };
}

export function selectSection(
  markdown: string,
  opts: { section?: string; query?: string; anchor?: string },
): SectionSlice {
  const anchor = opts.anchor?.trim();
  const section = opts.section?.trim();
  const query = opts.query?.trim();
  const all = blocks(markdown);

  if (anchor) {
    const sliced = sliceFromAnchor(markdown, anchor);
    if (sliced) {
      const notes = imageNotes(sliced.markdown);
      const body = notes.imageOnly ? `${notes.contentNotes[0]}\n\n${sliced.markdown}` : sliced.markdown;
      return {
        markdown: body,
        matched: true,
        section: sliced.title,
        anchor: decodeAnchor(anchor),
        imageOnly: notes.imageOnly,
        contentNotes: notes.contentNotes,
      };
    }
  }

  if (section) {
    const wanted = normalize(section);
    const block = all.find((item) => normalize(item.title).includes(wanted) || wanted.includes(normalize(item.title)) || (item.anchor && normalize(item.anchor) === wanted));
    if (block) {
      const sliced = sectionText(markdown, block, all);
      const notes = imageNotes(sliced);
      return {
        markdown: notes.imageOnly ? `${notes.contentNotes[0]}\n\n${sliced}` : sliced,
        matched: true,
        section: block.title,
        anchor: block.anchor,
        imageOnly: notes.imageOnly,
        contentNotes: notes.contentNotes,
      };
    }
  }

  if (query) {
    let best: { block: Block; score: number } | undefined;
    for (const block of all) {
      const immediate = immediateBody(markdown, block, all);
      const score = scoreText(query, `${block.title}\n${immediate.slice(0, 2000)}`);
      const deeper = best && score === best.score && score > 0 && block.level > best.block.level;
      if (!best || score > best.score || deeper) best = { block, score };
    }
    if (best && best.score >= 3) {
      const sliced = sectionText(markdown, best.block, all);
      const notes = imageNotes(sliced);
      return {
        markdown: notes.imageOnly ? `${notes.contentNotes[0]}\n\n${sliced}` : sliced,
        matched: true,
        section: best.block.title,
        anchor: best.block.anchor,
        imageOnly: notes.imageOnly,
        contentNotes: notes.contentNotes,
      };
    }
  }

  const notes = imageNotes(markdown);
  return {
    markdown: notes.imageOnly ? `${notes.contentNotes[0]}\n\n${markdown}` : markdown,
    matched: false,
    imageOnly: notes.imageOnly,
    contentNotes: notes.contentNotes,
  };
}

/** Default get_page budget: relevant sections, not the whole page. */
export const RELEVANT_SECTION_CAP = 6_000;

type Piece = {
  title: string;
  anchor?: string;
  text: string;
  score: number;
  index: number;
};

function pieces(markdown: string): Piece[] {
  const all = blocks(markdown);
  const out: Piece[] = [];
  if (all.length === 0) {
    const text = markdown.trim();
    if (text) out.push({ title: "", text, score: 0, index: 0 });
    return out;
  }
  const preamble = markdown.slice(0, all[0]?.start ?? 0).trim();
  if (preamble) out.push({ title: "", text: preamble, score: 0, index: 0 });
  all.forEach((block, index) => {
    const next = all[index + 1];
    const text = markdown.slice(block.start, next ? next.start : markdown.length).trim();
    if (!text) return;
    out.push({ title: block.title, anchor: block.anchor, text, score: 0, index: out.length });
  });
  return out;
}

function omittedLine(titles: string[]): string {
  if (titles.length === 0) return "";
  return `… omitted sections: ${titles.join(", ")}`;
}

function omittedTitles(all: Piece[], kept: Piece[]): string[] {
  const keptIds = new Set(kept.map((part) => part.index));
  return all.filter((part) => part.title.length > 0 && !keptIds.has(part.index)).map((part) => part.title);
}

function selectByBudget(parts: Piece[], budget: number): { kept: Piece[]; sliced: boolean } {
  const kept: Piece[] = [];
  let used = 0;
  for (const part of parts) {
    const sep = kept.length > 0 ? 2 : 0;
    if (used + sep + part.text.length <= budget) {
      kept.push(part);
      used += sep + part.text.length;
      continue;
    }
    if (kept.length === 0 && budget > 0) {
      const text = part.text.slice(0, budget).replace(/\s+$/, "");
      kept.push({ ...part, text });
      return { kept, sliced: text.length < part.text.length };
    }
    return { kept, sliced: false };
  }
  return { kept, sliced: false };
}

function markerFor(titles: string[], sliced: boolean): string {
  const line = omittedLine(titles);
  if (line && sliced) return `${line}\n\n…[truncated]`;
  if (line) return line;
  return sliced ? "…[truncated]" : "";
}

function renderPieces(chosen: Piece[], all: Piece[], budget: number): { text: string; truncated: boolean } {
  let room = budget;
  let fitted = selectByBudget(chosen, room);
  let text = "";
  let omitted: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    omitted = omittedTitles(all, fitted.kept);
    const marker = markerFor(omitted, fitted.sliced);
    const body = fitted.kept.map((part) => part.text).join("\n\n");
    text = marker ? (body ? `${body}\n\n${marker}` : marker) : body;
    if (text.length <= budget) break;
    const nextRoom = Math.max(0, room - (text.length - budget));
    const next = selectByBudget(chosen, nextRoom);
    const same =
      next.kept.length === fitted.kept.length &&
      next.sliced === fitted.sliced &&
      next.kept[0]?.text.length === fitted.kept[0]?.text.length;
    fitted = next;
    room = nextRoom;
    if (same) {
      text = text.slice(0, budget).replace(/\s+$/, "");
      break;
    }
  }
  return {
    text,
    truncated: fitted.sliced || omitted.length > 0 || fitted.kept.length < all.length,
  };
}

/** Headings only, so the caller can request one section instead of the page start. */
function sectionIndex(parts: Piece[], budget: number): { text: string; truncated: boolean } {
  const headed = parts.filter((part) => part.title.length > 0);
  if (headed.length === 0) return renderPieces(parts, parts, budget);
  const intro = "No section matched this query. Section index:";
  const lines: string[] = [];
  const kept: Piece[] = [];
  let used = intro.length;
  for (const part of headed) {
    const line = `\n- ${part.title}`;
    if (used + line.length > budget && kept.length > 0) break;
    lines.push(line);
    used += line.length;
    kept.push(part);
    if (used > budget) break;
  }
  let omitted = omittedTitles(headed, kept);
  let marker = omittedLine(omitted);
  while (marker && kept.length > 1 && intro.length + lines.join("").length + 2 + marker.length > budget) {
    lines.pop();
    kept.pop();
    omitted = omittedTitles(headed, kept);
    marker = omittedLine(omitted);
  }
  let text = `${intro}${lines.join("")}`;
  if (marker && text.length + 2 + marker.length <= budget) text = `${text}\n\n${marker}`;
  return { text, truncated: kept.length < headed.length };
}

function rankSections(parts: Piece[], query: string): Piece[] {
  const docs: IndexedDoc[] = parts.map((part) => ({
    manualId: "page-section",
    title: part.title || "preamble",
    url: `section:${part.index}`,
    text: part.text,
    kind: part.title ? "heading" : "page",
  }));
  const hits = rankHits(docs, query, Math.max(parts.length, 1));
  const byUrl = new Map<string, Piece>(parts.map((part) => [`section:${part.index}`, part]));
  const ranked: Piece[] = [];
  for (const hit of hits) {
    if (!(hit.score > 0)) continue;
    const part = byUrl.get(hit.url);
    if (part) ranked.push(part);
  }
  return ranked;
}

function pickRanked(ranked: Piece[], budget: number): Piece[] {
  const picked: Piece[] = [];
  let used = 0;
  for (const part of ranked) {
    const sep = picked.length > 0 ? 2 : 0;
    if (used + sep + part.text.length <= budget) {
      picked.push(part);
      used += sep + part.text.length;
    } else if (picked.length === 0) {
      picked.push(part);
      break;
    }
  }
  return picked.sort((a, b) => a.index - b.index);
}

export type PackedSections = SectionSlice & { truncated: boolean };

/**
 * Several sections, in document order, under maxChars. A query keeps the
 * sections that match it. When none do, the page's own sections are ranked
 * with BM25. When that is also empty, the result is a heading index.
 * Without a query, the leading sections are kept whole.
 * Dropped headings are listed as `… omitted sections: …`.
 * The page URL is the first line.
 */
export function packRelevantSections(
  markdown: string,
  opts: { query?: string; pageUrl: string; maxChars?: number },
): PackedSections {
  const cap = opts.maxChars ?? RELEVANT_SECTION_CAP;
  const header = `Source: ${opts.pageUrl}`;
  const budget = Math.max(0, cap - header.length - 2);
  const parts = pieces(markdown);
  const query = opts.query?.trim();
  let chosen = parts;
  let matched = false;
  let section: string | undefined;
  let anchor: string | undefined;
  let indexOnly = false;

  if (query && parts.length > 0) {
    for (const part of parts) {
      part.score = scoreText(query, `${part.title}\n${part.text.slice(0, 2000)}`);
    }
    const direct = parts
      .filter((part) => part.score >= 3)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const ranked = direct.length > 0 ? direct : rankSections(parts, query);
    if (ranked.length > 0) {
      matched = true;
      section = ranked[0]?.title || undefined;
      anchor = ranked[0]?.anchor;
      chosen = pickRanked(ranked, budget);
    } else {
      indexOnly = true;
    }
  }

  const fitted = indexOnly ? sectionIndex(parts, budget) : renderPieces(chosen, parts, budget);
  const body = fitted.text;
  const notes = imageNotes(body);
  const withNotes = notes.imageOnly && notes.contentNotes[0] ? `${notes.contentNotes[0]}\n\n${body}` : body;
  const packed = withNotes ? `${header}\n\n${withNotes}` : header;
  const over = packed.length > cap;
  return {
    markdown: over ? `${packed.slice(0, Math.max(0, cap - 16)).replace(/\s+$/, "")}\n\n…[truncated]` : packed,
    matched,
    section,
    anchor,
    imageOnly: notes.imageOnly,
    contentNotes: notes.contentNotes,
    truncated: fitted.truncated || over,
  };
}
