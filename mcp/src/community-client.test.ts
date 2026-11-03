import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityClient } from "./community-client.js";
import type { AuthSession } from "./community-auth.js";

const session: AuthSession = { community_token: "Bearer alice-token", forum_cookie: "_forum_session=alice-cookie" };
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }))); });
async function fixture(options: { skillStatus?: Record<string, unknown>; forumResponse?: Record<string, unknown>; forumTopic?: Record<string, unknown>; forumSessionStatus?: number } = {}) {
  const requests: Array<{ path: string; method: string; body: string; auth?: string; cookie?: string; csrf?: string; origin?: string }> = [];
  const s = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const path = req.url!; requests.push({ path, method: req.method!, body, auth: req.headers.authorization, cookie: req.headers.cookie, csrf: req.headers["x-csrf-token"] as string | undefined, origin: req.headers.origin });
    let data: any; let plain = false;
    if (path === "/api/auth/me") data = { communityUserId: "1", username: "alice" };
    else if (path === "/session/current.json" && options.forumSessionStatus) { res.writeHead(options.forumSessionStatus, { "Content-Type": "text/plain" }); res.end("session unavailable"); return; }
    else if (path === "/session/current.json") { plain = true; data = { current_user: { id: 2, username: "alice-forum" } }; }
    else if (path === "/session/csrf.json") { plain = true; data = { csrf: "csrf-value" }; }
    else if (path === "/api/assets/upload-policy") data = { key: JSON.parse(body).purpose + "/asset", uploadUrl: origin + "/oss", method: "POST", maxSizeBytes: 52428800, formFields: { policy: "signed-policy" } };
    else if (path === "/oss") { res.writeHead(204); res.end(); return; }
    else if (path === "/api/users/me/cases/create") data = { caseId: 31, repository: { url: "https://github.com/alice/camera" }, documents: [], statusCode: 0 };
    else if (path === "/api/users/me/cases/source-preview") data = { commitSha: "commit-1", repositoryUrl: "https://github.com/alice/camera", documents: [{ fileName: "README.md", markdown: "# Camera demo" }], warnings: [] };
    else if (path === "/api/users/me/cases/publish") data = { caseId: 31 };
    else if (path === "/api/users/me/cases/31") data = { caseId: 31, statusCode: 1 };
    else if (path === "/api/skills") data = { skillId: 98 };
    else if (path === "/api/users/me/skills/98") data = { skillId: 98, availabilityStatus: "ACTIVE", latestVersion: { reviewStatus: "PENDING_REVIEW" }, ...options.skillStatus };
    else if (path === "/uploads.json") { plain = true; data = { short_url: "upload://image.png" }; }
    else if (path === "/posts.json") { plain = true; data = options.forumResponse ?? { id: 91, topic_id: 42, post_number: 1 }; }
    else if (path === "/t/42.json") { plain = true; data = options.forumTopic ?? { id: 42, visible: true, deleted_at: null }; }
    else { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(plain ? data : { success: true, data, error: null }));
  }); servers.push(s); s.listen(0, "127.0.0.1"); await once(s, "listening");
  const origin = `http://127.0.0.1:${(s.address() as any).port}`;
  return { requests, client: new CommunityClient({ session: async () => session, communityOrigin: origin, forumOrigin: origin, uploadOrigin: origin }), origin };
}
const image = { field: "cover", path: "/demo.png", name: "demo.png", bytes: 3, sha256: "hash", data: Buffer.from("img") };

describe("existing community HTTP contracts", () => {
  it.each([[403, "login_required"], [404, "forum_login_required"]])("reports forum login expiry for non-JSON HTTP %s", async (forumSessionStatus, code) => {
    const { client } = await fixture({ forumSessionStatus });
    await expect(client.account("forum_post")).rejects.toMatchObject({ code });
  });
  it("accepts metadata-only case drafts, rechecks the previewed README and reports pending review", async () => {
    const { client, requests } = await fixture();
    const result = await client.submit({ author: { id: "1", username: "alice" }, files: [image], source: { commit_sha: "commit-1" }, content: {
      kind: "case", project_name: "Camera demo", summary: "Camera capture", category_codes: [3], platform_codes: [2], repository_url: "https://github.com/alice/camera", cover_path: "/demo.png",
    } });
    expect(result).toMatchObject({ id: 31, status: "pending_review" });
    expect(JSON.parse(requests.find(r => r.path.endsWith("/create"))!.body)).toEqual({ projectName: "Camera demo", projectSummary: "Camera capture", categoryCodes: [3], platformCodes: [2], repositoryUrl: "https://github.com/alice/camera", coverAssetKey: "CASE_COVER_IMAGE/asset", video: null });
    expect(JSON.parse(requests.find(r => r.path.endsWith("/publish"))!.body)).toEqual({ caseId: 31, acceptedOpenSourceLicense: true });
    expect(requests.find(r => r.path === "/oss")!.auth).toBeUndefined();
    const recheck = requests.findIndex(r => r.path.endsWith("/source-preview"));
    expect(recheck).toBeGreaterThan(requests.findIndex(r => r.path.endsWith("/create")));
    expect(recheck).toBeLessThan(requests.findIndex(r => r.path.endsWith("/publish")));
    expect(result.url).toContain("personal-center");
  });
  it("submits the real Skill metadata and ZIP key without claiming it is already published", async () => {
    const { client, requests } = await fixture();
    const result = await client.submit({ author: { id: "1", username: "alice" }, files: [{ ...image, field: "package", name: "demo.zip" }], content: {
      kind: "skill", display_name: "Camera helper", description: "Captures images", category: "CODING", developer_signature: "Alice", contact_email: "alice@example.com", version: "1.0.0", package_path: "/demo.zip", icon_asset_key: "skill/icon/01.png",
    } });
    expect(result).toMatchObject({ id: 98, status: "pending_review" });
    const body = JSON.parse(requests.find(r => r.path === "/api/skills")!.body);
    expect(body).toMatchObject({ displayName: "Camera helper", packageAssetKey: "SKILL_PACKAGE/asset", iconAssetKey: "skill/icon/01.png", version: "1.0.0" });
    expect(body).not.toHaveProperty("author");
  });
  it("does not report an approved but suspended Skill as published", async () => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: "SUSPENDED", latestVersion: { reviewStatus: "APPROVED" } } });
    expect(await client.status("skill", 98)).toMatchObject({
      id: 98, status: "suspended", details: { review_status: "APPROVED", availability_status: "SUSPENDED" },
    });
  });
  it.each([undefined, null, "UNRECOGNIZED"])("does not report an approved Skill as published when availability is %s", async (availabilityStatus) => {
    const { client } = await fixture({ skillStatus: { availabilityStatus, latestVersion: { reviewStatus: "APPROVED" } } });
    expect(await client.status("skill", 98)).toMatchObject({
      id: 98, status: "unknown", details: { review_status: "APPROVED", availability_status: availabilityStatus },
    });
  });
  it.each([
    ["PUBLISHED", "published"],
    ["IN_REVIEW", "pending_review"],
    ["REJECTED", "rejected"],
  ])("reports authorReviewStatus %s when the legacy field is absent", async (authorReviewStatus, status) => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: "ACTIVE", latestVersion: { authorReviewStatus } } });
    expect(await client.status("skill", 98)).toMatchObject({
      status, details: { author_review_status: authorReviewStatus, availability_status: "ACTIVE" },
    });
  });
  it("reports an approved and active Skill as published", async () => {
    const { client, origin } = await fixture({ skillStatus: { availabilityStatus: "ACTIVE", latestVersion: { reviewStatus: "APPROVED" } } });
    expect(await client.status("skill", 98)).toMatchObject({
      status: "published", url: `${origin}/skills/98`, details: { review_status: "APPROVED", availability_status: "ACTIVE" },
    });
  });
  it.each([
    ["SUSPENDED", "suspended"],
    ["UNRECOGNIZED", "unknown"],
  ])("checks availability %s for authorReviewStatus PUBLISHED", async (availabilityStatus, status) => {
    const { client } = await fixture({ skillStatus: { availabilityStatus, latestVersion: { authorReviewStatus: "PUBLISHED" } } });
    expect(await client.status("skill", 98)).toMatchObject({ status, details: { author_review_status: "PUBLISHED", availability_status: availabilityStatus } });
  });
  it.each([
    ["PENDING_REVIEW", "pending_review"],
    ["REVIEWING", "reviewing"],
    ["REJECTED", "rejected"],
    ["REVIEW_FAILED", "review_failed"],
  ])("preserves review state %s when availability is missing", async (reviewStatus, status) => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: undefined, latestVersion: { reviewStatus } } });
    expect(await client.status("skill", 98)).toMatchObject({ status, details: { review_status: reviewStatus } });
  });
  it("falls back to the legacy review status when the author status is unrecognized", async () => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: "ACTIVE", latestVersion: { authorReviewStatus: "UNRECOGNIZED", reviewStatus: "REVIEW_FAILED" } } });
    expect(await client.status("skill", 98)).toMatchObject({
      status: "review_failed", details: { author_review_status: "UNRECOGNIZED", review_status: "REVIEW_FAILED" },
    });
  });
  it.each([
    ["PUBLISHED", "APPROVED", "published"],
    ["IN_REVIEW", "PENDING_REVIEW", "pending_review"],
    ["IN_REVIEW", "REVIEWING", "reviewing"],
    ["REJECTED", "REVIEW_FAILED", "review_failed"],
  ])("retains detailed review status when both fields agree", async (authorReviewStatus, reviewStatus, status) => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: "ACTIVE", latestVersion: { authorReviewStatus, reviewStatus } } });
    expect(await client.status("skill", 98)).toMatchObject({
      status, details: { author_review_status: authorReviewStatus, review_status: reviewStatus, availability_status: "ACTIVE" },
    });
  });
  it("does not report publication when the review fields conflict", async () => {
    const { client } = await fixture({ skillStatus: { availabilityStatus: "ACTIVE", latestVersion: { authorReviewStatus: "PUBLISHED", reviewStatus: "REVIEWING" } } });
    expect(await client.status("skill", 98)).toMatchObject({
      status: "unknown", details: { author_review_status: "PUBLISHED", review_status: "REVIEWING", availability_status: "ACTIVE" },
    });
  });
  it.each([
    { action: "enqueued", id: 91, topic_id: 42 },
    { pending_post: { id: 92 } },
  ])("explains that a queued forum post has no queryable topic id", async (forumResponse) => {
    const { client, origin } = await fixture({ forumResponse });
    const result = await client.submit({ author: { id: "2", username: "alice-forum" }, files: [], content: {
      kind: "forum_post", title: "My RDK project", markdown: "Awaiting review", category_id: 40, tags: [], attachments: [],
    } });
    expect(result).toMatchObject({
      kind: "forum_post", id: null, status: "pending_review", url: `${origin}/u/alice-forum/activity`,
      details: { message: expect.stringMatching(/topic ID.*activity/i) },
    });
  });
  it.each([
    [{ id: 42, visible: true, deleted_at: null }, "published"],
    [{ id: 42, visible: false, deleted_at: null }, "unlisted"],
    [{ id: 42, visible: true, deleted_at: "2026-11-03T00:00:00Z" }, "deleted"],
    [{ id: 42 }, "unknown"],
  ])("reports forum topic state only when its visibility is known", async (forumTopic, status) => {
    const { client } = await fixture({ forumTopic });
    expect(await client.status("forum_post", 42)).toMatchObject({ id: 42, status });
  });
  it("rejects a forum status response for a different topic", async () => {
    const { client } = await fixture({ forumTopic: { id: 43, visible: true } });
    await expect(client.status("forum_post", 42)).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("does not report a nonpositive forum topic id as published", async () => {
    const { client } = await fixture({ forumResponse: { topic_id: 0 } });
    await expect(client.submit({ author: { id: "2", username: "alice-forum" }, files: [], content: {
      kind: "forum_post", title: "My RDK project", markdown: "Preview", category_id: 40, tags: [], attachments: [],
    } })).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("publishes forum attachments under the actual forum account using cookies and CSRF", async () => {
    const { client, requests, origin } = await fixture();
    const result = await client.submit({ author: { id: "2", username: "alice-forum" }, files: [{ ...image, field: "0" }], content: {
      kind: "forum_post", title: "My RDK project", markdown: "Photo: {{attachment:0}}", category_id: 40, tags: ["RDK X5"], attachments: ["/demo.png"],
    } });
    expect(result).toMatchObject({ id: 42, status: "published" });
    const request = requests.find(r => r.path === "/posts.json")!;
    expect(JSON.parse(request.body)).toMatchObject({ title: "My RDK project", raw: "Photo: ![demo.png](upload://image.png)", category: 40, tags: ["RDK X5"] });
    expect(request.auth).toBeUndefined(); expect(request.cookie).toBe(session.forum_cookie);
    for (const write of requests.filter(r => ["/uploads.json", "/posts.json"].includes(r.path))) {
      expect(write.csrf).toBe("csrf-value"); expect(write.origin).toBe(origin);
    }
  });
  it("rejects account changes before uploads and never forwards community authorization to the forum", async () => {
    const { client, requests } = await fixture();
    await expect(client.submit({ author: { id: "another-user", username: "bob" }, files: [], content: { kind: "forum_post", title: "hello", markdown: "hello", category_id: 40, attachments: [], tags: [] } })).rejects.toMatchObject({ code: "account_changed" });
    expect(requests).toHaveLength(1);
    expect(requests[0].auth).toBeUndefined();
  });
  it("shows the repository README and stops publication when its commit changed", async () => {
    const { client, requests } = await fixture();
    const content = { kind: "case" as const, project_name: "Camera", summary: "Demo", category_codes: [3], platform_codes: [2], repository_url: "https://github.com/alice/camera", cover_path: "/demo.png" };
    expect(await client.inspect(content)).toMatchObject({ commit_sha: "commit-1", documents: [{ markdown: "# Camera demo" }] });
    await expect(client.submit({ author: { id: "1", username: "alice" }, content, files: [image], source: { commit_sha: "old-commit" } })).rejects.toMatchObject({ code: "source_changed", details: { id: 31 } });
    expect(requests.some(r => r.path.endsWith("/publish"))).toBe(false);
  });
});
