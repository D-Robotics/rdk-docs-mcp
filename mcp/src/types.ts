export type IndexedDoc = {
  manualId: string;
  title: string;
  url: string;
  snippet?: string;
  text?: string;
  breadcrumbs?: string[];
  kind: "page" | "heading" | "snippet";
};

export type SearchHit = {
  title: string;
  url: string;
  manual: string;
  snippet: string;
  score: number;
};
