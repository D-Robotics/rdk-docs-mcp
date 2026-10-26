export type BoardId = "x3" | "x5" | "s100" | "s600";

const RULES: Array<{ id: BoardId; re: RegExp }> = [
  { id: "x5", re: /rdk[\s_-]*x[\s_-]*5|\bx5\b/i },
  { id: "x3", re: /rdk\s*x\s*3|\bx3\b|旭日\s*x3/i },
  { id: "s600", re: /\bs600\b/i },
  { id: "s100", re: /\bs100p?\b|\bs100\s*p\b/i },
];

/**
 * Board tokens already recognized above, longest first.
 * Glued names are split with this list instead of a separate regex per board.
 */
const BOARD_TOKENS = ["s100p", "s100", "s600", "x5", "x3"];

function rollback(part: string): boolean {
  return (process.env.RDK_ABLATE ?? "")
    .split(",")
    .map((item) => item.trim())
    .includes(part);
}

/** Treat `_`, `-`, and path punctuation as spaces so `driver_development_x5` names x5. */
function loose(value: string): string {
  return value.replace(/[_./#+-]+/g, " ");
}

/** List punctuation separates names: `x5、s100` is two boards. */
function separateLists(value: string): string {
  return value.replace(/[\u3001\uFF0C,;；]+/g, " ");
}

/**
 * Insert the boundaries the existing rules already understand.
 * `RDKS100` / `RDKX5` / `x3m` become spaced forms. No extra per-board pattern.
 * `RDK_ABLATE=board_glued` restores recognition of spaced names only.
 */
function unglue(value: string): string {
  let text = value.replace(/旭日\s*x?\s*(?=\d)/gi, "旭日 x");
  for (const token of BOARD_TOKENS) {
    const id = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`rdk(?=${id}(?![0-9a-z]))`, "gi"), "rdk ");
    text = text.replace(new RegExp(`\\b${id}(?=[a-z]{1,2}\\b)`, "gi"), `${token} `);
  }
  return text;
}

function boardText(value: string): string {
  const separated = separateLists(value);
  return rollback("board_glued") ? loose(separated) : unglue(loose(separated));
}

export function mentionedBoards(query: string): BoardId[] {
  const found = new Set<BoardId>();
  const hay = boardText(query);
  const raw = rollback("board_glued") ? separateLists(query) : unglue(separateLists(query));
  for (const rule of RULES) {
    if (rule.re.test(raw) || rule.re.test(hay)) found.add(rule.id);
  }
  return [...found];
}

export function soleBoard(query: string): BoardId | undefined {
  const boards = mentionedBoards(query);
  return boards.length === 1 ? boards[0] : undefined;
}

export function urlLooksLikeBoard(url: string, board: BoardId): boolean {
  const u = `${url}\n${loose(url)}`.toLowerCase();
  if (board === "x3") {
    return /rdk_x3|rdk\s*x3|\bx3\b|\/x3(?:_|\/|$)|hardware_introduction\/rdk_x3/.test(u);
  }
  if (board === "x5") {
    return /rdk_x5|rdk\s*x5|\bx5\b|\/x5(?:_|\/|$)|hardware_introduction\/rdk_x5|display_rdkx5/.test(u);
  }
  if (board === "s100") return /s100|rdk\s*s100/.test(u) && !/s600/.test(u);
  return /s600|rdk\s*s600/.test(u);
}
