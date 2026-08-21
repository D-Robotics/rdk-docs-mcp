# Forum Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `search_docs` / `get_page` also retrieve 地瓜机器人社区 (Discourse) so unofficial but useful troubleshooting sits next to the manuals.

**Architecture:** Consume the public Discourse JSON APIs (`/search.json`, `/t/{id}.json`). Do not crawl or mirror the forum. Keep the four existing MCP tools; add `source` (`docs` | `forum` | `all`, default `all`) and allow `manual: forum`. Official docs keep a ranking bonus. `get_page` allowlists `forum.d-robotics.cc` and renders cooked posts as Markdown.

**Tech Stack:** Existing Node/TypeScript MCP server, Vitest, Discourse JSON.

---

## Files

- Create: `mcp/src/forum.ts`, `mcp/src/forum.test.ts`
- Modify: `mcp/src/types.ts`, `mcp/src/service.ts`, `mcp/src/service.test.ts`, `mcp/src/fetch-page.ts`, `mcp/src/fetch-page.test.ts`, `mcp/src/http.ts`, `mcp/src/server.ts`, `mcp/src/catalog.ts`, `mcp/eval/cases.json`
- Docs: `SPEC-rdk-docs.md`, `README.md`, `skills/rdk-docs/SKILL.md`

### Task 1: Compact Discourse search + topic Markdown

- [x] Failing tests for search compact / topic id parse / cooked → markdown
- [x] Implement `forum.ts`

### Task 2: Wire search + get_page

- [x] `source` / `manual=forum` merge; forum URLs in `get_page`
- [x] Shorter cache TTL for `search.json`

### Task 3: Skill, SPEC, live eval

- [x] Skill: manuals first, forum as experience, cite both
- [x] Live case: S100 WiFi on `forum.d-robotics.cc`
