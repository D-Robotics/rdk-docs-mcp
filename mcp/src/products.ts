export type BoardId = "x3" | "x5" | "s100" | "s600";

const RULES: Array<{ id: BoardId; re: RegExp }> = [
  { id: "x5", re: /rdk\s*x\s*5|\bx5\b/i },
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
