# Community publishing implementation plan

**Goal:** Publish cases, Skills and forum posts through the existing MCP as the confirmed user.
**Architecture:** Typed publication schemas, an authenticated API/upload client, an account-bound preview service and thin MCP tools. Interactive browser login captures the user's session locally.
**Spec:** ../specs/2026-10-26-community-publishing-design.md
**Execution:** Implement inline in the isolated `feat/community-publishing` worktree. User has explicitly authorized this scope.

- [x] Write failing workflow tests for all three publication kinds, confirmation, user switching, modified files, review status and duplicate submission.
- [x] Implement schemas, account/session handling, API/upload adapter and preview service. Test with an actual local HTTP server, without publishing production content.
- [x] Register publishing/account/status tools in the MCP server; add protocol tests and keep the six read tools available.
- [x] Add browser login support and usage documentation matching the existing community agreements and review behavior.
- [x] Run the full tests and build; verify real account, published API options and MCP previews read-only. Record any remaining live-publication limitation.

## Verification — 2026-10-26

- `npm test -- --reporter=dot`: 423 tests passed in 32 suites. `npm run build`: passed.
- Live dedicated-browser login captured the user's personal community and linked forum sessions; no credentials were printed or put in the repository.
- Real stdio MCP: handshake and all 12 tools available. Authenticated case README preview, Skill preset/file preview and forum attachment preview succeeded. All three publishers rejected `confirmed:false`.
- Upload-policy limits and default Skill icon were checked against the actual community service. Upload/create/publish/review behavior was exercised with local HTTP fixtures, including forum CSRF headers, account changes and case README commit changes.
- Bundled `rdk-docs` and `forum-post` Skill validation passed. npm tarball includes the publishing modules, guide and both updated Skills.
- User-authorized draft-only validation saved one forum draft (`new_topic`) and one case draft under the user's personal account. Readback confirmed the forum body/category and case status 0 with no publication timestamp. A 1200×800 cover was uploaded and its displayed dimensions verified in the case form; no publish or Skill-review submission was called.
- Skill validation included the real MCP preview and, separately, browser form filling and ZIP upload. The open-source checkbox remained unchecked and the submit button disabled; no Skill record was submitted. The browser screenshot is form evidence, not an end-to-end MCP publication test.
- The live case draft response contains metadata and no README commit/documents. Corrected the adapter and HTTP fixtures to recheck the source-preview endpoint before publication instead of expecting a commit from draft creation. Full 423-test suite and build passed after the fix. The backend does not offer an atomic commit-pinning parameter.
- Draft persistence in this validation used the services' draft endpoints; the MCP currently exposes preview and publication, not a separate save-draft tool. Live submission still requires confirmation of that specific preview and applicable agreements.
