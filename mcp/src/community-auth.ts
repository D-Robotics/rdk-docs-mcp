import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { CommunityError, COMMUNITY_ORIGIN } from "./community-types.js";

export type AuthSession = { community_token: string; forum_cookie?: string };
type Cookie = { name: string; value: string; domain: string; path?: string };
function bearer(value: string) { return /^Bearer /i.test(value) ? value : `Bearer ${value}`; }
export class SessionStore {
  constructor(readonly path = process.env.RDK_COMMUNITY_AUTH_FILE ?? join(homedir(), ".config", "rdk-docs-mcp", "community-auth.json"), private env: NodeJS.ProcessEnv = process.env) {}
  async load(): Promise<AuthSession> {
    if (this.env.RDK_COMMUNITY_TOKEN) return { community_token: bearer(this.env.RDK_COMMUNITY_TOKEN), ...(this.env.RDK_FORUM_COOKIE ? { forum_cookie: this.env.RDK_FORUM_COOKIE } : {}) };
    try {
      const info = await stat(this.path);
      if (process.platform !== "win32" && (info.mode & 0o077)) throw new CommunityError("invalid_session", "The community session file must be private (chmod 600).");
      const value = JSON.parse(await readFile(this.path, "utf8"));
      if (typeof value.community_token !== "string" || !value.community_token.trim() || /[\r\n]/.test(value.community_token) || (value.forum_cookie !== undefined && (typeof value.forum_cookie !== "string" || /[\r\n]/.test(value.forum_cookie)))) throw new Error("invalid session");
      return { community_token: bearer(value.community_token), ...(value.forum_cookie ? { forum_cookie: value.forum_cookie } : {}) };
    } catch (error) {
      if (error instanceof CommunityError) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CommunityError("login_required", "Use community_account(action='login'), sign in yourself, then call action='complete_login'.");
      throw new CommunityError("invalid_session", "The local community session could not be read. Sign in again.");
    }
  }
  async save(session: AuthSession) {
    const folder = dirname(this.path); await mkdir(folder, { recursive: true, mode: 0o700 });
    // Only the dedicated credential directory is tightened; never chmod an arbitrary parent.
    const temporary = join(folder, `.community-auth-${randomUUID()}.tmp`);
    try { await writeFile(temporary, JSON.stringify(session), { mode: 0o600, flag: "wx" }); await rename(temporary, this.path); }
    finally { await rm(temporary, { force: true }); }
  }
  async clear() { await rm(this.path, { force: true }); }
}

export function sessionFromCookies(cookies: Cookie[]): AuthSession {
  const allowed = (c: Cookie) => ["developer.d-robotics.cc", "forum.d-robotics.cc", ".d-robotics.cc", "d-robotics.cc"].includes(c.domain);
  const token = cookies.find(c => allowed(c) && c.name === "token" && c.domain !== "forum.d-robotics.cc");
  if (!token) throw new CommunityError("login_required", "Complete the community login in the browser first.");
  let decoded: string; try { decoded = decodeURIComponent(token.value); } catch { throw new CommunityError("invalid_session", "The community login cookie is invalid."); }
  const forum = new Map<string, string>();
  for (const cookie of cookies.filter(allowed)) if (["_t", "_forum_session"].includes(cookie.name) && !/[\r\n;]/.test(cookie.value)) forum.set(cookie.name, cookie.value);
  return { community_token: bearer(decoded), ...(forum.size ? { forum_cookie: [...forum].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) };
}

const execute = promisify(execFile);
export class CommunityBrowserLogin {
  constructor(private store: SessionStore, private session = process.env.RDK_COMMUNITY_BROWSER_SESSION ?? "rdk-community") {}
  private async run(args: string[]): Promise<any> {
    try {
      const { stdout } = await execute("agent-browser", ["--session", this.session, "--json", ...args], { timeout: 45_000, maxBuffer: 4 * 1024 ** 2 });
      const result = JSON.parse(stdout);
      if (!result.success) throw new Error("browser command failed");
      return result.data;
    } catch { throw new CommunityError("browser_unavailable", "Interactive sign-in requires agent-browser and its browser runtime. Install them, then retry; passwords and tokens must not be sent through MCP tool arguments."); }
  }
  async start() {
    const profile = join(dirname(this.store.path), "browser-profile"); await mkdir(profile, { recursive: true, mode: 0o700 });
    await this.run(["--profile", profile, "--headed", "open", `${COMMUNITY_ORIGIN}/login`]);
    return { login_url: `${COMMUNITY_ORIGIN}/login`, message: "Sign in yourself in the browser window, then call community_account(action='complete_login')." };
  }
  async complete() {
    const before = await this.run(["cookies", "get"]);
    const initial = sessionFromCookies(before.cookies ?? before);
    const response = await fetch(`${COMMUNITY_ORIGIN}/api/auth/me`, { headers: { Authorization: initial.community_token }, signal: AbortSignal.timeout(20_000), redirect: "error" });
    const result = await response.json() as any;
    if (!response.ok || !result.success || !result.data?.communityUserId || result.data.degraded) throw new CommunityError("login_required", "Community sign-in has not completed successfully.");
    await this.run(["open", `${COMMUNITY_ORIGIN}/forum`]);
    const after = await this.run(["cookies", "get"]);
    const session = sessionFromCookies(after.cookies ?? after);
    await this.store.save(session);
    return { author: { id: result.data.communityUserId, username: result.data.username }, forum_session_captured: Boolean(session.forum_cookie) };
  }
}
