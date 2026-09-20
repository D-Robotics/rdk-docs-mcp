import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { cacheDir, cacheTtlMs } from "./http.js";

/**
 * Read-only skill-catalog access for the D-Robotics/rdk-skills hub (issue #4).
 *
 * The hub's own generators maintain the catalog; this module only fetches the
 * two published JSON files pinned to one commit SHA, validates them, and keeps
 * an atomic snapshot cache. It never installs skills or runs hub scripts.
 */

export const HUB_REPO = "D-Robotics/rdk-skills";
export const SKILL_INDEX_PATH = "skills/rdk-skill-finder/references/skill-index.json";
export const PACK_REGISTRY_PATH = "skills/rdk-pack-installer/references/pack-registry.json";
/** The flat skill that installs workspace packs; workspace results hand off to it. */
export const PACK_INSTALLER_SKILL = "rdk-pack-installer";

const REVISION_URL = `https://api.github.com/repos/${HUB_REPO}/commits/HEAD`;
const RAW_BASE = `https://raw.githubusercontent.com/${HUB_REPO}`;

const TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
/** Exported for tests only, so the size-limit case does not build a 5 MiB string. */
export const MAX_JSON_BYTES_FOR_TESTS = MAX_JSON_BYTES;
const SNAPSHOT_FILENAME = "skill-catalog-snapshot.json";
const USER_AGENT = "rdk-docs-mcp/0.1 (+https://developer.d-robotics.cc/rdk_doc_center/)";
const SHA_PATTERN = /^[0-9a-f]{40}$/;

export type SkillErrorCode =
  | "invalid_input"
  | "catalog_unavailable"
  | "invalid_catalog"
  | "unsupported_schema"
  | "unknown_skill"
  | "missing_installer";

export class SkillError extends Error {
  readonly code: SkillErrorCode;

  constructor(code: SkillErrorCode, message: string) {
    super(message);
    this.name = "SkillError";
    this.code = code;
  }
}

export type InstallType = "flat" | "workspace";

export type SkillRecord = {
  name: string;
  description: string;
  pack: string;
  repo: string;
  catalog_path: string;
  install_type: InstallType;
};

export type PackRecord = {
  name: string;
  repo: string;
  ref: string;
  catalog_dir: string;
  install_script: string;
  workspace_dir: string;
  verify_paths: string[];
};

/** One hub snapshot: both JSON files from the same commit SHA. */
export type SkillCatalogSnapshot = {
  schema: 1;
  revision: string;
  /** ISO UTC timestamp of the actual fetch, used for TTL accounting. */
  fetched_at: string;
  skills: SkillRecord[];
  packs: PackRecord[];
};

export type CatalogResult = {
  snapshot: SkillCatalogSnapshot;
  warnings: string[];
  from_cache: boolean;
};

// ---------------------------------------------------------------------------
// Schemas. Unknown extra fields are allowed so upstream can extend the index
// without breaking this reader (spec §2), but every field we rely on for
// commands, paths, and links is strictly validated.
// ---------------------------------------------------------------------------

/**
 * Rejects leading '-', shell metacharacters, and control characters while
 * accepting the S-series names such as `__SKILL_j6-plugin-__adaptation`.
 */
const SKILL_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const HUB_REPO_PATTERN = /^D-Robotics\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GIT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeRelativePath(value: string): boolean {
  if (value === "" || value.startsWith("/") || value.includes("\\") || value.includes("%")) return false;
  if (hasControlChars(value) || /\s/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isCatalogPath(value: string): boolean {
  return isSafeRelativePath(value) && value.startsWith("skills/") && value.length > "skills/".length;
}

const skillRecordSchema = z
  .object({
    name: z.string().min(1).regex(SKILL_NAME_PATTERN),
    description: z.string().min(1),
    pack: z.string().min(1),
    repo: z.string().regex(HUB_REPO_PATTERN),
    catalog_path: z.string().refine(isCatalogPath),
    install_type: z.enum(["flat", "workspace"]),
  })
  .passthrough();

const packRecordSchema = z
  .object({
    name: z.string().min(1),
    repo: z.string().regex(HUB_REPO_PATTERN),
    ref: z.string().min(1).regex(GIT_REF_PATTERN).refine((value) => !value.includes("..")),
    catalog_dir: z.string().refine(isSafeRelativePath),
    install_script: z.string().refine(isSafeRelativePath),
    workspace_dir: z.enum([".drobotics", ".horizon"]),
    verify_paths: z.array(z.string().refine(isSafeRelativePath)).min(1),
    install_type: z.literal("workspace"),
  })
  .passthrough();

const snapshotSchema = z
  .object({
    schema: z.literal(1),
    revision: z.string().regex(SHA_PATTERN),
    fetched_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
    skills: z.array(skillRecordSchema),
    packs: z.array(packRecordSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Fetch layer (injectable for tests).
// ---------------------------------------------------------------------------

export type CatalogHttpResult = { status: number; body: string };
export type CatalogHttp = (url: string) => Promise<CatalogHttpResult>;

function describeHttpError(url: string, status: number): string {
  const hint =
    status === 403 || status === 429
      ? " (GitHub rate limit; retry later)"
      : status === 404
        ? ` (catalog files missing in ${HUB_REPO})`
        : "";
  return `HTTP ${status} fetching ${url}${hint}`;
}

/** Transport errors (network, DNS, timeouts) keep the stable catalog_unavailable code. */
async function viaHttp(http: CatalogHttp, url: string): Promise<CatalogHttpResult> {
  try {
    return await http(url);
  } catch (error) {
    if (error instanceof SkillError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new SkillError("catalog_unavailable", `failed to fetch ${url}: ${message}`);
  }
}

async function fetchRevisionSha(http: CatalogHttp): Promise<string> {
  const { status, body } = await viaHttp(http, REVISION_URL);
  if (status !== 200) throw new SkillError("catalog_unavailable", describeHttpError(REVISION_URL, status));
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SkillError("invalid_catalog", `invalid JSON in revision response from ${REVISION_URL}`);
  }
  const sha =
    parsed && typeof parsed === "object" && "sha" in parsed ? String((parsed as { sha: unknown }).sha) : "";
  if (!SHA_PATTERN.test(sha)) {
    throw new SkillError("invalid_catalog", `revision response from ${REVISION_URL} has no valid commit sha`);
  }
  return sha;
}

async function fetchHubFile(http: CatalogHttp, sha: string, path: string): Promise<string> {
  const url = `${RAW_BASE}/${sha}/${path}`;
  const { status, body } = await viaHttp(http, url);
  if (status !== 200) throw new SkillError("catalog_unavailable", describeHttpError(url, status));
  if (body.length > MAX_JSON_BYTES) {
    throw new SkillError("catalog_unavailable", `${url} exceeds the ${MAX_JSON_BYTES} byte catalog limit`);
  }
  return body;
}

export const defaultCatalogHttp: CatalogHttp = async (url: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json, application/json, text/plain, */*" },
    });
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
      throw new SkillError("catalog_unavailable", `${url} exceeds the ${MAX_JSON_BYTES} byte catalog limit`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_JSON_BYTES) {
      throw new SkillError("catalog_unavailable", `${url} exceeds the ${MAX_JSON_BYTES} byte catalog limit`);
    }
    return { status: response.status, body: new TextDecoder().decode(bytes) };
  } catch (error) {
    if (error instanceof SkillError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const detail = /abort/i.test(message) ? `timeout after ${TIMEOUT_MS}ms` : message;
    throw new SkillError("catalog_unavailable", `failed to fetch ${url}: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
};

// ---------------------------------------------------------------------------
// Parsing and cross-validation.
// ---------------------------------------------------------------------------

function parseJson(raw: string, source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillError(
      "invalid_catalog",
      `invalid JSON in ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SkillError("invalid_catalog", `${source} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "unknown validation issue";
}

/**
 * Schema gate before validation: an unknown schema_version must be reported
 * as unsupported_schema, not as a generic invalid catalog.
 */
function requireSchemaVersion(parsed: Record<string, unknown>, source: string): void {
  const version = parsed.schema_version;
  if (version !== 1) {
    throw new SkillError(
      "unsupported_schema",
      `${source} schema_version=${String(version)} is not supported (expected 1)`,
    );
  }
}

function parseIndexFile(raw: string): { skills: SkillRecord[] } {
  const source = SKILL_INDEX_PATH;
  const parsed = parseJson(raw, source);
  requireSchemaVersion(parsed, source);
  const result = z.object({ skills: z.array(skillRecordSchema) }).passthrough().safeParse(parsed);
  if (!result.success) {
    throw new SkillError("invalid_catalog", `invalid skill index (${source}): ${firstIssue(result.error)}`);
  }
  return { skills: result.data.skills as SkillRecord[] };
}

function parsePackFile(raw: string): { packs: PackRecord[] } {
  const source = PACK_REGISTRY_PATH;
  const parsed = parseJson(raw, source);
  requireSchemaVersion(parsed, source);
  const result = z.object({ packs: z.array(packRecordSchema) }).passthrough().safeParse(parsed);
  if (!result.success) {
    throw new SkillError("invalid_catalog", `invalid pack registry (${source}): ${firstIssue(result.error)}`);
  }
  return { packs: result.data.packs as PackRecord[] };
}

/**
 * Cross-file consistency: unique names, unique pack identity, and every
 * workspace skill must resolve to a pack record from the same repo. A missing
 * pack is a hard failure — it must never degrade into a flat install.
 */
export function crossValidate(skills: SkillRecord[], packs: PackRecord[], revision: string): void {
  const seenNames = new Set<string>();
  for (const skill of skills) {
    if (seenNames.has(skill.name)) {
      throw new SkillError(
        "invalid_catalog",
        `duplicate skill name ${JSON.stringify(skill.name)} at revision ${revision}`,
      );
    }
    seenNames.add(skill.name);
  }

  const packsByName = new Map<string, PackRecord>();
  const packsByRepo = new Map<string, PackRecord>();
  for (const pack of packs) {
    if (packsByName.has(pack.name)) {
      throw new SkillError("invalid_catalog", `duplicate pack name ${JSON.stringify(pack.name)}`);
    }
    if (packsByRepo.has(pack.repo)) {
      throw new SkillError("invalid_catalog", `pack repo ${pack.repo} is registered more than once`);
    }
    packsByName.set(pack.name, pack);
    packsByRepo.set(pack.repo, pack);
  }

  for (const skill of skills) {
    if (skill.install_type !== "workspace") continue;
    const pack = packsByName.get(skill.pack);
    if (!pack) {
      throw new SkillError(
        "invalid_catalog",
        `workspace skill ${skill.name} references pack ${JSON.stringify(skill.pack)} missing from the registry`,
      );
    }
    if (pack.repo !== skill.repo) {
      throw new SkillError(
        "invalid_catalog",
        `workspace skill ${skill.name} repo ${skill.repo} does not match pack ${JSON.stringify(pack.name)} repo ${pack.repo}`,
      );
    }
  }
}

function buildSnapshot(indexRaw: string, packRaw: string, revision: string, fetchedAt: string): SkillCatalogSnapshot {
  const { skills } = parseIndexFile(indexRaw);
  const { packs } = parsePackFile(packRaw);
  crossValidate(skills, packs, revision);
  return { schema: 1, revision, fetched_at: fetchedAt, skills, packs };
}

// ---------------------------------------------------------------------------
// Snapshot cache: one JSON file, atomically replaced, fully re-validated on
// read. A corrupt or stale cache is a miss; a failed refresh never falls back
// to stale install advice (spec §3).
// ---------------------------------------------------------------------------

function snapshotCachePath(): string {
  return join(cacheDir(), SNAPSHOT_FILENAME);
}

async function readCachedSnapshot(): Promise<{ snapshot: SkillCatalogSnapshot; fetchedAtMs: number } | undefined> {
  let raw: string;
  try {
    raw = await readFile(snapshotCachePath(), "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed = snapshotSchema.parse(JSON.parse(raw)) as SkillCatalogSnapshot;
    crossValidate(parsed.skills, parsed.packs, parsed.revision);
    const fetchedAtMs = Date.parse(parsed.fetched_at);
    return { snapshot: parsed, fetchedAtMs };
  } catch {
    return undefined; // corrupt cache is a miss, never an error for the caller
  }
}

async function writeSnapshotCache(snapshot: SkillCatalogSnapshot): Promise<void> {
  const path = snapshotCachePath();
  const tmp = join(dirname(path), `${SNAPSHOT_FILENAME}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

// ---------------------------------------------------------------------------
// Loader with in-process dedupe.
// ---------------------------------------------------------------------------

export type CatalogLoadDeps = {
  httpGet?: CatalogHttp;
  now?: () => number;
};

let memorySnapshot: SkillCatalogSnapshot | undefined;
let memoryWarnings: string[] = [];
let memoryFetchedAt: number | undefined;
let loadInFlight: Promise<CatalogResult> | undefined;

/** Test hook: the loader keeps process-level state; tests must reset it. */
export function resetSkillCatalogState(): void {
  memorySnapshot = undefined;
  memoryWarnings = [];
  memoryFetchedAt = undefined;
  loadInFlight = undefined;
}

async function refreshSnapshot(deps: CatalogLoadDeps, now: () => number): Promise<CatalogResult> {
  const http = deps.httpGet ?? defaultCatalogHttp;
  const revision = await fetchRevisionSha(http);
  const [indexRaw, packRaw] = await Promise.all([
    fetchHubFile(http, revision, SKILL_INDEX_PATH),
    fetchHubFile(http, revision, PACK_REGISTRY_PATH),
  ]);
  const snapshot = buildSnapshot(indexRaw, packRaw, revision, new Date(now()).toISOString());

  const warnings: string[] = [];
  try {
    await writeSnapshotCache(snapshot);
  } catch (error) {
    warnings.push(`cache_write_failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  memorySnapshot = snapshot;
  memoryFetchedAt = now();
  memoryWarnings = warnings;
  return { snapshot, warnings, from_cache: false };
}

async function loadFromDiskOrRefresh(deps: CatalogLoadDeps, now: () => number): Promise<CatalogResult> {
  const ttl = cacheTtlMs();
  const cached = await readCachedSnapshot();
  if (cached && ttl > 0 && now() - cached.fetchedAtMs <= ttl) {
    memorySnapshot = cached.snapshot;
    memoryFetchedAt = cached.fetchedAtMs;
    memoryWarnings = [];
    return { snapshot: cached.snapshot, warnings: [], from_cache: true };
  }
  return refreshSnapshot(deps, now);
}

/**
 * Load the skill catalog snapshot. Fresh in-process state and a fresh disk
 * snapshot are used directly; otherwise one shared refresh runs, fetching the
 * revision first and both JSON files from that exact SHA. Concurrent callers
 * share the in-flight refresh; it is cleared once settled.
 */
export async function loadSkillCatalog(deps: CatalogLoadDeps = {}): Promise<CatalogResult> {
  const now = deps.now ?? Date.now;
  const ttl = cacheTtlMs();
  if (memorySnapshot && memoryFetchedAt !== undefined && ttl > 0 && now() - memoryFetchedAt <= ttl) {
    return { snapshot: memorySnapshot, warnings: memoryWarnings, from_cache: true };
  }
  if (loadInFlight) return loadInFlight;
  loadInFlight = loadFromDiskOrRefresh(deps, now).finally(() => {
    loadInFlight = undefined;
  });
  return loadInFlight;
}

/** Blob URL of a skill's SKILL.md inside the hub at the snapshot revision. */
export function skillSourceUrl(snapshot: SkillCatalogSnapshot, catalogPath: string): string {
  return `https://github.com/${HUB_REPO}/blob/${snapshot.revision}/${catalogPath}/SKILL.md`;
}

/** Hub install/usage doc pinned to the snapshot revision. */
export function hubUsageUrl(snapshot: SkillCatalogSnapshot): string {
  return `https://github.com/${HUB_REPO}/blob/${snapshot.revision}/docs/SKILL-USAGE.md`;
}
