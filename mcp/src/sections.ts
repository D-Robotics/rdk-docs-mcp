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

function fitPieces(parts: Piece[], budget: number): { text: string; truncated: boolean } {
  const kept: Piece[] = [];
  let used = 0;
  for (const part of parts) {
    const sep = kept.length > 0 ? 2 : 0;
    if (used + sep + part.text.length <= budget) {
      kept.push(part);
      used += sep + part.text.length;
      continue;
    }
    if (kept.length === 0) {
      const room = Math.max(0, budget - 16);
      return { text: `${part.text.slice(0, room)}\n\n…[truncated]`, truncated: true };
    }
    return { text: kept.map((item) => item.text).join("\n\n"), truncated: true };
  }
  return { text: kept.map((item) => item.text).join("\n\n"), truncated: false };
}

export type PackedSections = SectionSlice & { truncated: boolean };

/**
 * Several sections, in document order, under maxChars. A query keeps the
 * sections that match it. Without a query, the leading sections are kept whole.
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

  if (query) {
    for (const part of parts) {
      part.score = scoreText(query, `${part.title}\n${part.text.slice(0, 2000)}`);
    }
    const ranked = parts
      .filter((part) => part.score >= 3)
      .sort((a, b) => b.score - a.score || a.index - b.index);
    if (ranked.length > 0) {
      matched = true;
      section = ranked[0]?.title || undefined;
      anchor = ranked[0]?.anchor;
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
      chosen = picked.sort((a, b) => a.index - b.index);
    }
  }

  const fitted = fitPieces(chosen, budget);
  const body = fitted.text;
  const notes = imageNotes(body);
  const withNotes = notes.imageOnly && notes.contentNotes[0] ? `${notes.contentNotes[0]}\n\n${body}` : body;
  const packed = withNotes ? `${header}\n\n${withNotes}` : header;
  return {
    markdown: packed.length > cap ? `${packed.slice(0, Math.max(0, cap - 16))}\n\n…[truncated]` : packed,
    matched,
    section,
    anchor,
    imageOnly: notes.imageOnly,
    contentNotes: notes.contentNotes,
    truncated: fitted.truncated || packed.length > cap || chosen.length < parts.length,
  };
}
