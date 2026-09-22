export type BoardId = "x3" | "x5" | "s100" | "s600";

type BoardScopedDocument = {
  manualId: string;
  title: string;
  url: string;
  breadcrumbs?: string[];
};

const BOARD_IDS: BoardId[] = ["x3", "x5", "s100", "s600"];

const MANUAL_BOARD_SCOPES: Record<string, BoardId[]> = {
  "rdk-x": ["x3", "x5"],
  "rdk-s": ["s100", "s600"],
  "oe-x3": ["x3"],
  "oe-x5": ["x5"],
  "x5-sdk": ["x5"],
  magicbox: ["x5"],
  "oe-s": ["s100", "s600"],
  "oe-llm-s100": ["s100"],
  "oe-llm-s600": ["s600"],
  "case-s600": ["s600"],
};

const RULES: Array<{ id: BoardId; re: RegExp }> = [
  { id: "x5", re: /rdk[\s_-]*x[\s_-]*5|\bx5\b/i },
  { id: "x3", re: /rdk\s*x\s*3|\bx3\b|旭日\s*x3/i },
  { id: "s600", re: /\bs600\b/i },
  { id: "s100", re: /\bs100p?\b|\bs100\s*p\b/i },
];

export function mentionedBoards(query: string): BoardId[] {
  const found = new Set<BoardId>();
  for (const rule of RULES) {
    if (rule.re.test(query)) found.add(rule.id);
  }
  return [...found];
}

export function soleBoard(query: string): BoardId | undefined {
  const boards = mentionedBoards(query);
  return boards.length === 1 ? boards[0] : undefined;
}

export function urlLooksLikeBoard(url: string, board: BoardId): boolean {
  const u = url.toLowerCase();
  if (board === "x3") {
    return /rdk_x3|rdk\s*x3|\bx3\b|\/x3(?:_|\/|$)|hardware_introduction\/rdk_x3/.test(u);
  }
  if (board === "x5") {
    return /rdk_x5|rdk\s*x5|\bx5\b|\/x5(?:_|\/|$)|hardware_introduction\/rdk_x5|display_rdkx5/.test(u);
  }
  if (board === "s100") return /s100|rdk\s*s100/.test(u) && !/s600/.test(u);
  return /s600|rdk\s*s600/.test(u);
}

/**
 * Returns only board scope made explicit by page metadata or by a board-family
 * manual. An empty result means the page is shared or its scope is unknown.
 */
export function documentBoardScope(doc: BoardScopedDocument): BoardId[] {
  const pageIdentity = [doc.url, doc.title, ...(doc.breadcrumbs ?? [])].join(" ");
  const explicit = new Set(mentionedBoards(pageIdentity));
  for (const board of BOARD_IDS) {
    if (urlLooksLikeBoard(pageIdentity, board)) explicit.add(board);
  }
  if (explicit.size > 0) return [...explicit];
  return MANUAL_BOARD_SCOPES[doc.manualId] ?? [];
}

export function isClearlyIncompatibleBoardDoc(
  doc: BoardScopedDocument,
  query: string,
): boolean {
  const target = soleBoard(query);
  if (!target) return false;
  const scope = documentBoardScope(doc);
  return scope.length > 0 && !scope.includes(target);
}
