export type IndexedDoc = {
  manualId: string;
  title: string;
  url: string;
  snippet?: string;
  text?: string;
  breadcrumbs?: string[];
  kind: "page" | "heading" | "snippet";
};

export type HitRole = "official-start" | "related" | "forum-supplement";

export type SearchHit = {
  title: string;
  url: string;
  manual: string;
  snippet: string;
  score: number;
  source: "docs" | "forum";
  role?: HitRole;
};

export type PageContentSource = "html" | "search_index" | "forum" | "unavailable";

export type PageResult = {
  title: string;
  url: string;
  markdown: string;
  content_source: PageContentSource;
  evidence_notes: string[];
  offset: number;
  next_offset: number | null;
  total_chars: number;
  content_hash: string;
  truncated: boolean;
};
