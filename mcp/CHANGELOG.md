# Changelog

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
