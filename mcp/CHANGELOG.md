# Changelog

## 0.4.1 — 2026-11-02

- **The live documentation index is now the single source of truth.** A cold start fetches the published index and keeps it on disk; the packaged `prebuilt/` snapshot is only a fallback when the live fetch fails. Previously a packaged snapshot younger than 14 days was served even though the site had moved on, so new and renamed pages were invisible until the next release.
- Search-index cache TTL is 15 minutes (down from 24 hours). Expiry revalidates with `If-None-Match`/`If-Modified-Since` and a 304 keeps the cached body, so a warm start still costs one conditional request rather than a full download. The in-process cache shares the same TTL instead of pinning the index for the whole session.
- A failed live fetch serves the cached copy and logs it, so a network blip degrades freshness instead of returning no results. The packaged-snapshot fallback names its build time in `warnings`.
- The manual with build-time page bodies (RDK Ultra) still reads its snapshot first, because the live index carries no page text for it.
- Add the RDK X5 case manual (`x5-cases`) and the audio kit manual (`audio-kit`) to the catalog. The X5 chip manual now points at `/sdk_doc/versions/latest/`: `/x5_sdk_doc/*` 301s to the oldest version (1.1.2), so the old path indexed stale pages.

## 0.4.0 — 2026-10-27

- Add personal-account case, Skill and forum-post publication with local previews and explicit human confirmation.
- Reuse the community's repository-backed case, signed upload-policy and Skill-review APIs. Report published, pending, rejected and unknown states separately.
- Capture the user's own login in a dedicated browser session; store publishing credentials in a private local file and never accept passwords/tokens through MCP arguments.
- Bind confirmations to the author and attachment hashes; recheck the case repository commit before publication, accepting metadata-only draft creation responses. Keep the seven read tools, including `get_status`.
- Preserve the current naming, BM25 retrieval, alternate queries, section output, packaged indexes and installer backups.
- Fix URL cache collisions and cache-write failures; atomically replace installer-managed files while preserving permissions and validating JSON launch entries.
- Add revision-bound Skill content, discovery metadata health and compile/network/role filters.
- Add read-only diagnostics and opt-in hash-checked full-page windows with content-source evidence.
- Verify installed tarballs on Linux/Node 20 and Windows/Node 22 alongside existing retrieval CI.

## 0.3.0 — 2026-10-10

### Fixed

- **`search_skills` and `get_skill` work again.** On 2026-09-24 D-Robotics/rdk-skills renamed the pack workspace directories to `.drobotics-s` and `.drobotics-x5`. The catalog validator only accepted the exact names `.drobotics` and `.horizon`, so it rejected the whole catalog and both tools failed for every user. `workspace_dir` is now checked by family: any `.drobotics` or `.horizon` name with optional lowercase `-suffix` segments is accepted. Paths, `.ssh`, `.git`, uppercase and other names are still rejected. A board in the suffix (`.drobotics-x5`, `.drobotics-s`, `.drobotics-s600`) is used for board scoping.

### Retrieval (B5)

- **Board detection:** glued names such as `RDKX5` and `RDKS100` are recognized. Unscoped hits are ordered by score, and a page is scored as its best chunk plus a share of its other chunks.
- **`alt_queries`:** `search_docs` takes up to three documentation-worded rewrites and merges them with the original query by page. An alternate longer than 300 characters is dropped with a warning.
- **Leaner results:** `search_docs` returns five compact hits (title, URL, anchor, snippet) unless `limit` or `verbose` is set. `get_page` returns the sections that match the query or anchor instead of the whole page; `full=true` still returns everything.
- **Manuals:** the RDK Ultra manual is indexed and kept out of searches for other named boards. Pages that return HTTP 404/410 twice are dropped from the snapshot, and duplicate English OE pages are removed.
- The index warms in the background, so the MCP handshake no longer waits for it.

### Installer (`--install`)

- **Backups:** before changing an existing config file (`~/.cursor/mcp.json`, `~/.zcode/cli/config.json`, `~/.codex/config.toml`, `~/.dsh/cordis.patch.yml`), the installer copies it to `<file>.bak`. An existing `.bak` is never overwritten; a later change writes `<file>.bak.<timestamp>` instead.
- **No reset on re-run:** an existing `rdk-docs` entry that can launch (any `command` or `url`, for example Windows `cmd /c npx ...` or a `--registry` mirror) is kept as is, and the file is not rewritten. Only a missing or unlaunchable entry is written. Codex already behaved this way.
- **More skills directories:** Skills are also written for Gemini CLI, Google Antigravity (`~/.gemini/config`, legacy `~/.gemini/antigravity`, `~/.gemini/antigravity-cli`), Windsurf, Devin Desktop, OpenClaw, QoderWork and workbuddy, only when that client's own directory already exists. The startup Skill refresh covers these directories too and still never creates new copies.

### Docs

- `install.md` rewritten from clean-environment tests of the Cursor and Claude Code paths: the backup rule, Claude Code adds the MCP before running the installer, Gemini CLI needs `-s user`, the per-client skills directory list, a self-check that prints `OK 6 tools`, troubleshooting, and uninstall steps.
