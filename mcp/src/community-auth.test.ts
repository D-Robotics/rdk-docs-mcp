import { mkdtemp, readFile, stat, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore, sessionFromCookies } from "./community-auth.js";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe("personal community sessions", () => {
  it("stores credentials privately outside the tool response and supports local logout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-auth-")); dirs.push(dir);
    const file = join(dir, "config", "session.json"); const store = new SessionStore(file, {});
    await store.save({ community_token: "Bearer test-secret", forum_cookie: "_t=private" });
    // Windows stat does not report Unix permission bits. The loader enforces 0600 only off Windows.
    if (process.platform !== "win32") {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await stat(join(dir, "config"))).mode & 0o777).toBe(0o700);
    }
    expect(await store.load()).toMatchObject({ community_token: "Bearer test-secret" });
    await store.clear(); await expect(store.load()).rejects.toMatchObject({ code: "login_required" });
  });
  it("does not print malformed session file contents or silently replace an unreadable session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rdk-auth-")); dirs.push(dir);
    const file = join(dir, "session.json"); await writeFile(file, 'secret-invalid-json'); await chmod(file, 0o600);
    await expect(new SessionStore(file, {}).load()).rejects.toMatchObject({ code: "invalid_session" });
  });
  it("uses explicitly supplied personal environment credentials without an admin username", async () => {
    const store = new SessionStore("/does/not/exist", { RDK_COMMUNITY_TOKEN: "personal-token", RDK_FORUM_COOKIE: "_t=user" });
    expect(await store.load()).toEqual({ community_token: "Bearer personal-token", forum_cookie: "_t=user" });
  });
  it("captures only the intended community/forum cookies and excludes unrelated browser accounts", () => {
    const result = sessionFromCookies([
      { name: "token", value: "Bearer%20personal", domain: "developer.d-robotics.cc", path: "/" },
      { name: "_t", value: "forum-user", domain: "forum.d-robotics.cc", path: "/" },
      { name: "_forum_session", value: "forum-session", domain: ".d-robotics.cc", path: "/" },
      { name: "token", value: "other-account", domain: "unrelated.example", path: "/" },
      { name: "analytics", value: "ignore", domain: ".d-robotics.cc", path: "/" },
    ]);
    expect(result).toEqual({ community_token: "Bearer personal", forum_cookie: "_t=forum-user; _forum_session=forum-session" });
  });
});
