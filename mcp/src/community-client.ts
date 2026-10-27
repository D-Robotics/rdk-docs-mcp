import { extname } from "node:path";
import { SessionStore, type AuthSession } from "./community-auth.js";
import { CommunityError, COMMUNITY_ORIGIN, FORUM_ORIGIN, type CommunityAccount, type PublicationContent, type PublicationKind, type PublicationResult, type VerifiedFile } from "./community-types.js";
import type { PublishingBackend, VerifiedPublication } from "./community-publishing.js";

const mime = (name: string) => ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".zip": "application/zip", ".mp4": "video/mp4", ".webm": "video/webm" }[extname(name).toLowerCase()] ?? "application/octet-stream");
type Options = { session?: () => Promise<AuthSession>; communityOrigin?: string; forumOrigin?: string; uploadOrigin?: string };
export class CommunityClient implements PublishingBackend {
  private community: string; private forum: string; private session: () => Promise<AuthSession>;
  constructor(private options: Options = {}) {
    this.community = options.communityOrigin ?? COMMUNITY_ORIGIN; this.forum = options.forumOrigin ?? FORUM_ORIGIN;
    const store = new SessionStore(); this.session = options.session ?? (() => store.load());
  }
  private async request(path: string, session: AuthSession, body?: unknown, forum = false, csrf?: string): Promise<any> {
    if (forum && !session.forum_cookie) throw new CommunityError("forum_login_required", "Sign in to the forum via community_account login/complete_login first.");
    const headers: Record<string, string> = forum ? { Cookie: session.forum_cookie!, "X-Requested-With": "XMLHttpRequest" } : { Authorization: session.community_token };
    if (csrf) { headers["X-CSRF-Token"] = csrf; headers.Origin = this.forum; }
    const form = body instanceof FormData;
    if (body !== undefined && !form) headers["Content-Type"] = "application/json";
    const response = await fetch((forum ? this.forum : this.community) + path, {
      method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    let result: any; try { result = await response.json(); } catch { throw new CommunityError("invalid_response", "The community returned an unreadable response."); }
    if (response.status === 401 || response.status === 403) throw new CommunityError("login_required", "This account is not signed in or lacks permission for this operation. Sign in with your own account.");
    if (!response.ok || (!forum && !result.success) || (forum && result.errors)) {
      let message = forum ? result.errors?.join("; ") : result.error?.message;
      if (typeof message !== "string") message = `Community request failed (HTTP ${response.status}).`;
      for (const secret of [session.community_token, session.forum_cookie, csrf]) if (secret) message = message.split(secret).join("[redacted]");
      throw new CommunityError("community_rejected", message);
    }
    return forum ? result : result.data;
  }
  private async accountWith(kind: PublicationKind, session: AuthSession): Promise<CommunityAccount> {
    const result = await this.request(kind === "forum_post" ? "/session/current.json" : "/api/auth/me", session, undefined, kind === "forum_post");
    const user = kind === "forum_post" ? result.current_user : result;
    const id = kind === "forum_post" ? user?.id : user?.communityUserId;
    if (id == null || typeof user?.username !== "string" || user.degraded) throw new CommunityError("login_required", "A verified personal community account is required.");
    return { id: String(id), username: user.username };
  }
  async account(kind: PublicationKind) { return this.accountWith(kind, await this.session()); }
  async inspect(content: PublicationContent): Promise<Record<string, unknown> | undefined> {
    if (content.kind !== "case") return undefined;
    const source = await this.request("/api/users/me/cases/source-preview", await this.session(), { repositoryUrl: content.repository_url });
    if (!source.commitSha || !Array.isArray(source.documents)) throw new CommunityError("invalid_source", "The community could not provide a versioned README preview for this repository.");
    return { repository_url: source.repositoryUrl, commit_sha: source.commitSha, documents: source.documents, warnings: source.warnings ?? [] };
  }
  async normalize(content: PublicationContent): Promise<PublicationContent> {
    if (content.kind !== "skill" || content.icon_path || content.icon_asset_key) return content;
    const presets = await this.request("/api/skills/icon-presets", await this.session());
    const first = (Array.isArray(presets) ? presets : presets.items)?.[0];
    if (!first?.assetKey) throw new CommunityError("icon_required", "Supply icon_path or select an available icon_asset_key.");
    return { ...content, icon_asset_key: first.assetKey };
  }
  private async upload(file: VerifiedFile, purpose: string, session: AuthSession): Promise<string> {
    const policy = await this.request("/api/assets/upload-policy", session, { purpose });
    const url = new URL(policy.uploadUrl);
    const approved = url.origin === this.options.uploadOrigin || (url.protocol === "https:" && /^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname));
    if (!approved || policy.method !== "POST" || typeof policy.key !== "string") throw new CommunityError("invalid_upload_policy", "The server returned an unsupported upload destination.");
    if (!Number.isFinite(policy.maxSizeBytes) || file.data.length > policy.maxSizeBytes) throw new CommunityError("invalid_file", `${file.name} exceeds the community upload limit.`);
    const form = new FormData();
    for (const [key, value] of Object.entries(policy.formFields ?? {})) form.append(key, String(value));
    form.append("file", new Blob([new Uint8Array(file.data)], { type: mime(file.name) }), file.name);
    const response = await fetch(url, { method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new CommunityError("upload_failed", `Upload failed for ${file.name} (HTTP ${response.status}).`);
    return policy.key;
  }
  async submit(publication: VerifiedPublication): Promise<PublicationResult> {
    const session = await this.session(); const { content, files, author } = publication;
    if ((await this.accountWith(content.kind, session)).id !== author.id) throw new CommunityError("account_changed", "The signed-in account changed. Prepare a new preview.");
    const file = (field: string) => { const f = files.find(x => x.field === field); if (!f) throw new CommunityError("invalid_file", `Missing ${field} file.`); return f; };
    if (content.kind === "case") {
      const coverAssetKey = await this.upload(file("cover"), "CASE_COVER_IMAGE", session);
      const created = await this.request("/api/users/me/cases/create", session, {
        projectName: content.project_name, projectSummary: content.summary, categoryCodes: content.category_codes, platformCodes: content.platform_codes,
        repositoryUrl: content.repository_url, coverAssetKey, video: content.video_embed ? { providerCode: 1, url: content.video_embed } : null,
      });
      const id = created.caseId;
      if (!Number.isSafeInteger(id) || id <= 0) throw new CommunityError("invalid_response", "The case creation response did not contain an id. Check your case workspace before retrying.");
      if (publication.source?.commit_sha) {
        // Draft creation stores metadata only; it does not return a README commit.
        let current;
        try { current = await this.request("/api/users/me/cases/source-preview", session, { repositoryUrl: content.repository_url }); }
        catch { throw new CommunityError("case_publication_incomplete", "A case draft was created, but its repository could not be rechecked. It was not published; check the existing draft before retrying.", { id, url: `${this.community}/cases/publish?caseId=${id}` }); }
        if (current.commitSha !== publication.source.commit_sha) {
          throw new CommunityError("source_changed", "The repository changed after the README preview. A draft was created but was not published; review its current README before proceeding.", { id, url: `${this.community}/cases/publish?caseId=${id}` });
        }
      }
      try { await this.request("/api/users/me/cases/publish", session, { caseId: id, acceptedOpenSourceLicense: true }); }
      catch { throw new CommunityError("case_publication_incomplete", "A case draft was created, but publication was not confirmed. Check the existing draft before retrying.", { id, url: `${this.community}/cases/publish?caseId=${id}` }); }
      return this.afterSubmission("case", id, session);
    }
    if (content.kind === "skill") {
      const packageAssetKey = await this.upload(file("package"), "SKILL_PACKAGE", session);
      const iconAssetKey = content.icon_path ? await this.upload(file("icon"), "SKILL_ICON", session) : content.icon_asset_key;
      const created = await this.request("/api/skills", session, { displayName: content.display_name, description: content.description, category: content.category,
        developerSignature: content.developer_signature, contactEmail: content.contact_email, version: content.version, packageAssetKey, iconAssetKey });
      if (!Number.isSafeInteger(created.skillId) || created.skillId <= 0) throw new CommunityError("invalid_response", "The Skill response did not contain an id. Check your Skill workspace before retrying.");
      return this.afterSubmission("skill", created.skillId, session);
    }
    const csrf = (await this.request("/session/csrf.json", session, undefined, true)).csrf;
    if (typeof csrf !== "string" || !csrf) throw new CommunityError("forum_login_required", "The forum did not return a CSRF token. Sign in again.");
    let raw = content.markdown;
    for (const attachment of files) {
      const form = new FormData(); form.append("type", "composer"); form.append("synchronous", "true");
      form.append("file", new Blob([new Uint8Array(attachment.data)], { type: mime(attachment.name) }), attachment.name);
      const uploaded = await this.request("/uploads.json", session, form, true, csrf);
      if (typeof uploaded.short_url !== "string" || !/^upload:\/\//.test(uploaded.short_url)) throw new CommunityError("invalid_response", "The forum upload did not return an attachment reference.");
      const name = attachment.name.replace(/[\[\]\r\n]/g, "_");
      const video = /\.(mp4|webm)$/i.test(name); const image = /\.(png|jpe?g|gif|webp)$/i.test(name);
      const markdown = `${image || video ? "!" : ""}[${name}${video ? "|video" : ""}](${uploaded.short_url})`;
      const marker = `{{attachment:${attachment.field}}}`;
      raw = raw.includes(marker) ? raw.split(marker).join(markdown) : `${raw}\n\n${markdown}`;
    }
    const result = await this.request("/posts.json", session, { title: content.title, raw, category: content.category_id, tags: content.tags }, true, csrf);
    if (result.action === "enqueued" || result.pending_post) return { kind: "forum_post", id: null, status: "pending_review", url: `${this.forum}/u/${encodeURIComponent(author.username)}/activity` };
    if (!Number.isSafeInteger(result.topic_id)) throw new CommunityError("invalid_response", "The forum did not confirm a topic id. Check your forum activity before retrying.");
    return { kind: "forum_post", id: result.topic_id, status: "published", url: `${this.forum}/t/topic/${result.topic_id}` };
  }
  private async afterSubmission(kind: "case" | "skill", id: number, session: AuthSession) {
    try { return await this.readStatus(kind, id, session); }
    catch { return { kind, id, status: "submitted", url: `${this.community}/personal-center?section=${kind === "case" ? "cases" : "skills"}`, details: { status_read_failed: true } }; }
  }
  private async readStatus(kind: PublicationKind, id: number, session: AuthSession): Promise<PublicationResult> {
    if (kind === "forum_post") {
      const topic = await this.request(`/t/${id}.json`, session, undefined, true);
      return { kind, id, status: topic.visible === false ? "unlisted" : "published", url: `${this.forum}/t/topic/${id}` };
    }
    const data = await this.request(`/api/users/me/${kind === "case" ? "cases" : "skills"}/${id}`, session);
    if (kind === "case") {
      const status = ({ 0: "draft", 1: "pending_review", 2: "published", 3: "rejected" } as Record<number, string>)[data.statusCode] ?? "unknown";
      return { kind, id, status, url: status === "published" ? `${this.community}/cases/${id}` : `${this.community}/personal-center?section=cases`, details: { status_code: data.statusCode } };
    }
    const review = data.latestVersion?.reviewStatus;
    const status = ({ APPROVED: "published", PENDING_REVIEW: "pending_review", REVIEWING: "reviewing", REJECTED: "rejected", REVIEW_FAILED: "review_failed" } as Record<string, string>)[review] ?? "unknown";
    return { kind, id, status, url: `${this.community}/${status === "published" ? "skills" : "personal-center/skills"}/${id}`, details: { review_status: review, availability_status: data.availabilityStatus } };
  }
  async status(kind: PublicationKind, id: number) { return this.readStatus(kind, id, await this.session()); }
}
