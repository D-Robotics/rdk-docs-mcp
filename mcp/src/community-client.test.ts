import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityClient } from "./community-client.js";
import type { AuthSession } from "./community-auth.js";

const session: AuthSession = { community_token: "Bearer alice-token", forum_cookie: "_forum_session=alice-cookie" };
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }))); });
async function fixture() {
  const requests: Array<{ path: string; method: string; body: string; auth?: string; cookie?: string; csrf?: string; origin?: string }> = [];
  const s = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const path = req.url!; requests.push({ path, method: req.method!, body, auth: req.headers.authorization, cookie: req.headers.cookie, csrf: req.headers["x-csrf-token"] as string | undefined, origin: req.headers.origin });
    let data: any; let plain = false;
    if (path === "/api/auth/me") data = { communityUserId: "1", username: "alice" };
    else if (path === "/session/current.json") { plain = true; data = { current_user: { id: 2, username: "alice-forum" } }; }
    else if (path === "/session/csrf.json") { plain = true; data = { csrf: "csrf-value" }; }
    else if (path === "/api/assets/upload-policy") data = { key: JSON.parse(body).purpose + "/asset", uploadUrl: origin + "/oss", method: "POST", maxSizeBytes: 52428800, formFields: { policy: "signed-policy" } };
    else if (path === "/oss") { res.writeHead(204); res.end(); return; }
    else if (path === "/api/users/me/cases/create") data = { caseId: 31, repository: { url: "https://github.com/alice/camera" }, documents: [], statusCode: 0 };
    else if (path === "/api/users/me/cases/source-preview") data = { commitSha: "commit-1", repositoryUrl: "https://github.com/alice/camera", documents: [{ fileName: "README.md", markdown: "# Camera demo" }], warnings: [] };
    else if (path === "/api/users/me/cases/publish") data = { caseId: 31 };
    else if (path === "/api/users/me/cases/31") data = { caseId: 31, statusCode: 1 };
    else if (path === "/api/skills") data = { skillId: 98 };
    else if (path === "/api/users/me/skills/98") data = { skillId: 98, availabilityStatus: "UNRESOLVED", latestVersion: { reviewStatus: "PENDING_REVIEW" } };
    else if (path === "/uploads.json") { plain = true; data = { short_url: "upload://image.png" }; }
    else if (path === "/posts.json") { plain = true; data = { id: 91, topic_id: 42, post_number: 1 }; }
    else { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(plain ? data : { success: true, data, error: null }));
  }); servers.push(s); s.listen(0, "127.0.0.1"); await once(s, "listening");
  const origin = `http://127.0.0.1:${(s.address() as any).port}`;
  return { requests, client: new CommunityClient({ session: async () => session, communityOrigin: origin, forumOrigin: origin, uploadOrigin: origin }), origin };
}
const image = { field: "cover", path: "/demo.png", name: "demo.png", bytes: 3, sha256: "hash", data: Buffer.from("img") };

describe("existing community HTTP contracts", () => {
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
