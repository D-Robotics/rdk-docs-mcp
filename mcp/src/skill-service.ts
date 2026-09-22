import { readSkillContent, type SkillContentInput } from "./skill-content.js";
import { metadataHealth, resolveMetadata, type MetadataHealth, type MetadataEvidence } from "./skill-metadata.js";
import { searchStructured, classificationFor, type Task, type Role } from "./skill-structured.js";
import {
  HUB_REPO,
  PACK_INSTALLER_SKILL,
  SkillError,
  hubUsageUrl,
  loadSkillCatalog,
  packBoardFamilyIndex,
  skillSourceUrl,
  type CatalogResult,
  type InstallType,
  type SkillCatalogSnapshot,
  type SkillRecord,
} from "./skill-catalog.js";
import { searchSkillRecords } from "./skill-search.js";

/**
 * Service layer for search_skills / get_skill (issue #4 §4). All names,
 * paths, and install arguments in the output originate from the validated
 * catalog snapshot — user input is only used for lookup, never spliced into
 * commands.
 */

export type SkillSearchInput = {
  query: string;
  task?: Task;
  role?: Role;
  exclude_platforms?: string[];
  workflow?: "ptq" | "qat" | "undecided" | null;
  pack?: string;
  platform?: string;
  install_type?: InstallType;
  limit?: number;
};

export type SkillMatchView = {
  metadata_evidence: MetadataEvidence;
  classification: ReturnType<typeof classificationFor> | null;
  name: string;
  display_name: string;
  description: string;
  pack: string;
  repo: string;
  catalog_path: string;
  install_type: InstallType;
  source_url: string;
  score: number;
  matched_terms: string[];
  match_reason: string;
  /** Board evidence relative to the active board constraint; never a compatibility claim. */
  platform_scope: "matched-board" | "unknown" | "unconstrained";
};

export type SearchSkillsOutput = {
  metadata_health: MetadataHealth;
  matches: SkillMatchView[];
  catalog_revision: string;
  fetched_at: string;
  warnings: string[];
  guidance: string;
  /** Machine-readable guidance kind, e.g. invalid_input for zero-token queries. */
  guidance_kind: string;
};

export type FlatInstallation = {
  type: "flat";
  command: "npx";
  args: string[];
  display_command: string;
  requires_user_request: true;
  version_policy: "installer_default_not_catalog_pinned";
  verification: { required: true; catalog_revision: string; source_url: string; note: string };
  docs_url: string;
  note: string;
};

export type WorkspaceInstallation = {
  type: "workspace";
  handoff_skill: typeof PACK_INSTALLER_SKILL;
  installer: { command: "npx"; args: string[]; display_command: string };
  pack: {
    name: string;
    repo: string;
    ref: string;
    catalog_dir: string;
    install_script: string;
    workspace_dir: string;
    verify_paths: string[];
  };
  requires_project_root: true;
  requires_user_request: true;
  docs_url: string;
  note: string;
};

export type Installation = FlatInstallation | WorkspaceInstallation;

export type GetSkillInput = { name: string; include_content?: boolean } & SkillContentInput;

export type GetSkillOutput = {
  metadata_evidence: MetadataEvidence;
  content?: Awaited<ReturnType<typeof readSkillContent>>;
  classification: ReturnType<typeof classificationFor> | null;
  name: string;
  display_name: string;
  description: string;
  pack: string;
  repo: string;
  catalog_path: string;
  install_type: InstallType;
  source_url: string;
  catalog_revision: string;
  fetched_at: string;
  warnings: string[];
  installation: Installation;
};

export type SkillServiceDeps = {
  fetchContent?: (url: string) => Promise<string>;
  loadCatalog?: () => Promise<CatalogResult>;
};

const MAX_QUERY_CHARS = 500;
const FLAT_INSTALL_ARGS = ["skills", "add", "d-robotics/rdk-skills", "--skill"] as const;

/**
 * Readable display name for the hub generator's internal naming format
 * (rdk-skills @08d0a46): `__SKILL_<family>-__<slug>` → `<family>-<slug>`.
 * Strictly limited to that known format — `name` (the exact get_skill key and
 * install argument) is never rewritten, and names outside the format keep
 * display_name === name. Two records may share one display_name; they stay
 * distinguishable and exactly fetchable by their distinct canonical names.
 */
const GENERATED_SKILL_NAME = /^__SKILL_([A-Za-z0-9._-]+?)-__([A-Za-z0-9._-]+)$/;

export function skillDisplayName(name: string): string {
  const match = GENERATED_SKILL_NAME.exec(name);
  return match ? `${match[1]}-${match[2]}` : name;
}

/** POSIX-style single quoting for display commands; safe for any validated value. */
export function shellQuote(argv: string[]): string {
  return argv
    .map((arg) => {
      if (arg !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
      return `'${arg.replaceAll("'", `'\\''`)}'`;
    })
    .join(" ");
}

async function loadCatalog(deps?: SkillServiceDeps): Promise<CatalogResult> {
  return deps?.loadCatalog ? deps.loadCatalog() : loadSkillCatalog();
}

function requireQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) throw new SkillError("invalid_input", "query is required and must be non-empty after trimming");
  if (trimmed.length > MAX_QUERY_CHARS) {
    throw new SkillError("invalid_input", `query must be at most ${MAX_QUERY_CHARS} characters (got ${trimmed.length})`);
  }
  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new SkillError("invalid_input", "limit must be an integer between 1 and 20");
  }
  return limit;
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new SkillError("invalid_input", "name is required and must be non-empty after trimming");
  return trimmed;
}

function requireInstallType(installType: string | undefined): InstallType | undefined {
  if (installType === undefined) return undefined;
  if (installType !== "flat" && installType !== "workspace") {
    throw new SkillError("invalid_input", "install_type must be 'flat' or 'workspace'");
  }
  return installType;
}

export async function searchSkills(input: SkillSearchInput, deps?: SkillServiceDeps): Promise<SearchSkillsOutput> {
  const query = requireQuery(input.query);
  const pack = optionalTrimmed(input.pack);
  const platform = optionalTrimmed(input.platform);
  const installType = requireInstallType(input.install_type);
  const limit = requireLimit(input.limit);

  const catalog = await loadCatalog(deps);
  const { snapshot, warnings } = catalog;
  if (!input.task && (input.exclude_platforms !== undefined || input.workflow !== undefined || input.role !== undefined)) throw new SkillError("invalid_input", "task is required with structured workflow/exclusions/role");
  const outcome = input.task ? searchStructured(snapshot.skills, query, {task:input.task, role:input.role, platform, exclude_platforms:input.exclude_platforms, workflow:input.workflow, pack, installType, limit}) : searchSkillRecords(
    snapshot.skills,
    query,
    { pack, platform, installType, limit },
    packBoardFamilyIndex(snapshot.packs),
  );

  return {
    metadata_health: outcome.metadata_health ?? metadataHealth(snapshot.skills),
    matches: outcome.matches.map((match) => {
      const { classification, ...evidence } = resolveMetadata(match.skill);
      return {
        metadata_evidence: evidence,
        classification: classification ?? null,
        name: match.skill.name,
        display_name: skillDisplayName(match.skill.name),
        description: match.skill.description,
        pack: match.skill.pack,
        repo: match.skill.repo,
        catalog_path: match.skill.catalog_path,
        install_type: match.skill.install_type,
        source_url: skillSourceUrl(snapshot, match.skill.catalog_path),
        score: match.score,
        matched_terms: match.matched_terms,
        match_reason: match.match_reason,
        platform_scope: match.platform_scope,
      };
    }),
    catalog_revision: snapshot.revision,
    fetched_at: snapshot.fetched_at,
    warnings: [...warnings, ...(input.task ? [] : ["legacy_query: unstructured candidates only; use task and explicit constraints for recommendations"])],
    guidance: outcome.guidance,
    guidance_kind: outcome.guidance_kind,
  };
}

function flatInstallation(snapshot: SkillCatalogSnapshot, skill: SkillRecord): FlatInstallation {
  const args = [...FLAT_INSTALL_ARGS, skill.name];
  return {
    type: "flat",
    command: "npx",
    args,
    display_command: shellQuote(["npx", ...args]),
    requires_user_request: true,
    version_policy: "installer_default_not_catalog_pinned",
    verification: {
      required: true, catalog_revision: snapshot.revision,
      source_url: skillSourceUrl(snapshot, skill.catalog_path),
      note: "Check the actual installed source revision and Skill content before use; installer defaults do not guarantee this catalog revision.",
    },
    docs_url: hubUsageUrl(snapshot),
    note:
      `Installs the skill's whole directory (SKILL.md plus references/scripts) from the ${HUB_REPO} hub, not a single SKILL.md. ` +
      "The installer picks the actual version; it is not pinned to the catalog revision shown here. Run it only when the user explicitly asked to install.",
  };
}

function workspaceInstallation(snapshot: SkillCatalogSnapshot, skill: SkillRecord): WorkspaceInstallation {
  const installerRecord = snapshot.skills.find(
    (candidate) => candidate.name === PACK_INSTALLER_SKILL && candidate.install_type === "flat",
  );
  if (!installerRecord) {
    throw new SkillError(
      "missing_installer",
      `the workspace pack handoff skill ${PACK_INSTALLER_SKILL} is not present as a flat record in catalog revision ${snapshot.revision}; no installer command can be derived`,
    );
  }
  const pack = snapshot.packs.find((candidate) => candidate.name === skill.pack && candidate.repo === skill.repo);
  if (!pack) {
    // crossValidate makes this unreachable for validated snapshots; kept as a
    // hard failure so a future regression can never degrade to a flat install.
    throw new SkillError(
      "invalid_catalog",
      `workspace skill ${skill.name} has no pack record in catalog revision ${snapshot.revision}`,
    );
  }
  const installerArgs = [...FLAT_INSTALL_ARGS, PACK_INSTALLER_SKILL];
  return {
    type: "workspace",
    handoff_skill: PACK_INSTALLER_SKILL,
    installer: {
      command: "npx",
      args: installerArgs,
      display_command: shellQuote(["npx", ...installerArgs]),
    },
    pack: {
      name: pack.name,
      repo: pack.repo,
      ref: pack.ref,
      catalog_dir: pack.catalog_dir,
      install_script: pack.install_script,
      workspace_dir: pack.workspace_dir,
      verify_paths: [...pack.verify_paths],
    },
    requires_project_root: true,
    requires_user_request: true,
    docs_url: hubUsageUrl(snapshot),
    note:
      "This skill is part of a workspace-integrated pack: installing it means installing the whole pack through the " +
      `${PACK_INSTALLER_SKILL} handoff (project root required), never copying this single skill into a global skills dir. ` +
      `catalog_revision (${snapshot.revision}) is the hub catalog snapshot; pack ref (${pack.ref}) is the pinned upstream release the installer compares against — they are different things, and a plain 'npx skills add' is not pinned to either.`,
  };
}

export async function getSkillDetail(input: GetSkillInput, deps?: SkillServiceDeps): Promise<GetSkillOutput> {
  const name = requireName(input.name);
  if (!input.include_content && (input.offset !== undefined || input.max_chars !== undefined || input.expected_content_hash !== undefined)) {
    throw new SkillError("invalid_input", "Content parameters require include_content=true");
  }
  const catalog = await loadCatalog(deps);
  const { snapshot, warnings } = catalog;

  const skill = snapshot.skills.find((candidate) => candidate.name === name);
  if (!skill) {
    throw new SkillError(
      "unknown_skill",
      `unknown skill ${JSON.stringify(name)} in catalog revision ${snapshot.revision}; call search_skills to list valid names`,
    );
  }

  const content = input.include_content ? await readSkillContent(snapshot, skill, input, deps?.fetchContent) : undefined;
  const { classification: _, ...metadata_evidence } = resolveMetadata(skill);
  return {
    metadata_evidence,
    ...(content ? {content} : {}),
    classification: classificationFor(skill) ?? null,
    name: skill.name,
    display_name: skillDisplayName(skill.name),
    description: skill.description,
    pack: skill.pack,
    repo: skill.repo,
    catalog_path: skill.catalog_path,
    install_type: skill.install_type,
    source_url: skillSourceUrl(snapshot, skill.catalog_path),
    catalog_revision: snapshot.revision,
    fetched_at: snapshot.fetched_at,
    warnings: [...warnings, ...(content?.status === "unavailable" ? ["content_unavailable: catalog summary is available but SKILL.md source was not verified"] : [])],
    installation:
      skill.install_type === "flat" ? flatInstallation(snapshot, skill) : workspaceInstallation(snapshot, skill),
  };
}
