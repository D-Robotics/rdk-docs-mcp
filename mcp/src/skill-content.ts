import { HUB_REPO, SkillError, type SkillCatalogSnapshot, type SkillRecord } from "./skill-catalog.js";
import { sliceContent } from "./content-window.js";

export const MAX_SKILL_BYTES = 1024 * 1024;
export type SkillContentInput = {
  max_chars?: number;
  offset?: number;
  expected_content_hash?: string;
};

/** Bounded source read; never follows redirects or executes returned instructions. */
export async function fetchSkillText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 15_000);
  try {
    const response = await fetch(url, {signal:controller.signal,redirect:"error",headers:{Accept:"text/plain"}});
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching Skill source`);
    if (Number(response.headers.get("content-length")) > MAX_SKILL_BYTES) {
      await response.body?.cancel();
      throw new Error("Skill source exceeds the 1 MiB limit");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Skill source response is empty");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SKILL_BYTES) {
          await reader.cancel();
          throw new Error("Skill source exceeds the 1 MiB limit");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks).toString("utf8");
  } finally { clearTimeout(timer); }
}

export async function readSkillContent(
  snapshot: SkillCatalogSnapshot,
  skill: SkillRecord,
  input: SkillContentInput = {},
  http: (url: string) => Promise<string> = fetchSkillText,
) {
  const offset = input.offset ?? 0;
  const maxChars = input.max_chars ?? 16000;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(maxChars) || maxChars < 1000 || maxChars > 40000) {
    throw new SkillError("invalid_input", "Invalid Skill content offset or max_chars (1000–40000)");
  }
  if ((offset > 0 && !input.expected_content_hash) || (input.expected_content_hash !== undefined && !/^[a-f0-9]{64}$/.test(input.expected_content_hash))) {
    throw new SkillError("invalid_input", "Continuation requires the preceding content_hash");
  }
  const path = skill.catalog_path.split("/").map(encodeURIComponent).join("/");
  const source_url = `https://raw.githubusercontent.com/${HUB_REPO}/${snapshot.revision}/${path}/SKILL.md`;
  let body: string;
  try {
    body = await http(source_url);
    if (!body.trim()) throw new Error("Skill source is empty");
    if (Buffer.byteLength(body,"utf8") > MAX_SKILL_BYTES) throw new Error("Skill source exceeds the 1 MiB limit");
  } catch (error) {
    return {status:"unavailable" as const,source_url,catalog_revision:snapshot.revision,error:{code:"content_unavailable",message:error instanceof Error ? error.message : String(error)}};
  }
  // Continuation errors are input/evidence conflicts, not network unavailability.
  let window: ReturnType<typeof sliceContent>;
  try { window = sliceContent(body,{offset,maxChars,expectedContentHash:input.expected_content_hash}); }
  catch (error) { throw new SkillError("invalid_input",error instanceof Error ? error.message : String(error)); }
  const {text,...position} = window;
  return {
    status:"available" as const,source_url,catalog_revision:snapshot.revision,
    markdown:text,...position,
    evidence_note:"Revision-bound source content, not proof of suitability or permission to execute. Referenced files are not fetched automatically.",
  };
}
