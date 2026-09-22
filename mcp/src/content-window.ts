import { createHash } from "node:crypto";

export type ContentWindowInput = {
  offset?: number;
  maxChars?: number;
  expectedContentHash?: string;
};

export type ContentWindow = {
  text: string;
  offset: number;
  next_offset: number | null;
  total_chars: number;
  content_hash: string;
  truncated: boolean;
};

const DEFAULT_MAX_CHARS = 16_000;

export function sliceContent(text: string, input: ContentWindowInput): ContentWindow {
  const offset = input.offset ?? 0;
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error("maxChars must be a positive integer");
  }
  if (offset > text.length) {
    throw new Error(`offset ${offset} exceeds content length ${text.length}`);
  }

  const content_hash = createHash("sha256").update(text, "utf8").digest("hex");
  if (offset > 0 && !input.expectedContentHash) {
    throw new Error("expectedContentHash is required when offset is greater than 0");
  }
  if (input.expectedContentHash && input.expectedContentHash !== content_hash) {
    throw new Error("Content changed since the previous window; restart from offset 0.");
  }

  const end = Math.min(offset + maxChars, text.length);
  const next_offset = end < text.length ? end : null;
  return {
    text: text.slice(offset, end),
    offset,
    next_offset,
    total_chars: text.length,
    content_hash,
    truncated: next_offset !== null,
  };
}
