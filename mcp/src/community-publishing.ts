import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { CommunityError, COMMUNITY_ORIGIN, FORUM_ORIGIN, publicationSchema,
  type CommunityAccount, type PublicationContent, type PublicationInput, type PublicationKind,
  type PublicationFile, type VerifiedFile, type PublicationResult } from "./community-types.js";

export type VerifiedPublication = { content: PublicationContent; author: CommunityAccount; files: VerifiedFile[]; source?: Record<string, unknown> };
export interface PublishingBackend {
  account(kind: PublicationKind): Promise<CommunityAccount>;
  normalize?(input: PublicationContent): Promise<PublicationContent>;
  inspect?(input: PublicationContent): Promise<Record<string, unknown> | undefined>;
  submit(publication: VerifiedPublication): Promise<PublicationResult>;
  status(kind: PublicationKind, id: number): Promise<PublicationResult>;
}
type Preview = { confirmation_id: string; kind: PublicationKind; author: CommunityAccount; destination: string;
  content: PublicationContent; files: PublicationFile[]; agreements: string[]; source?: Record<string, unknown> };
type Pending = { preview: Preview; attempted: boolean; result?: PublicationResult };
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

function fileInputs(input: PublicationContent): Array<{ field: string; path: string; max: number; extensions?: string[] }> {
  const image = [".png", ".jpg", ".jpeg", ".webp"];
  if (input.kind === "case") return [{ field: "cover", path: input.cover_path, max: 10 * 1024 ** 2, extensions: image }];
  if (input.kind === "skill") return [
    { field: "package", path: input.package_path, max: 50 * 1024 ** 2, extensions: [".zip"] },
    ...(input.icon_path ? [{ field: "icon", path: input.icon_path, max: 2 * 1024 ** 2, extensions: image }] : []),
  ];
  return input.attachments.map((path, i) => ({ field: String(i), path, max: Infinity }));
}

export class CommunityPublisher {
  private pending = new Map<string, Pending>();
  constructor(readonly backend: PublishingBackend) {}

  async prepare(input: PublicationInput): Promise<Preview> {
    let content = publicationSchema.parse(input);
    const author = await this.backend.account(content.kind);
    if (this.backend.normalize) content = publicationSchema.parse(await this.backend.normalize(content));
    const files: PublicationFile[] = [];
    for (const file of fileInputs(content)) {
      if (file.extensions && !file.extensions.includes(extname(file.path).toLowerCase())) {
        throw new CommunityError("invalid_file", `Unsupported file type: ${basename(file.path)}`);
      }
      const path = resolve(file.path); const data = await readFile(path);
      if (!data.length || data.length > file.max) throw new CommunityError("invalid_file", `Invalid file size: ${basename(path)}`);
      files.push({ field: file.field, path, name: basename(path), bytes: data.length, sha256: digest(data) });
    }
    if (content.kind === "forum_post") {
      for (const match of content.markdown.matchAll(/\{\{attachment:(\d+)\}\}/g)) {
        if (Number(match[1]) >= files.length) throw new CommunityError("invalid_file", `Attachment ${match[1]} does not exist.`);
      }
    }
    const preview: Preview = {
      confirmation_id: randomUUID(), kind: content.kind, author,
      destination: content.kind === "forum_post" ? `${FORUM_ORIGIN}/c/${content.category_id}` : `${COMMUNITY_ORIGIN}/${content.kind === "case" ? "cases" : "marketplace"}`,
      content, files, agreements: content.kind === "forum_post" ? [] : [
        "我同意将本内容以开源方式发布，并授权社区分发与展示。",
        ...(content.kind === "case" ? ["本项目为本人原创，或已获得授权／遵守相关开源协议。"] : []),
      ],
    };
    if (this.backend.inspect) preview.source = await this.backend.inspect(content);
    this.pending.set(preview.confirmation_id, { preview: structuredClone(preview), attempted: false });
    return preview;
  }

  async publish(kind: PublicationKind, confirmationId: string, confirmed: boolean, acceptedLicense: boolean): Promise<PublicationResult> {
    if (!confirmed) throw new CommunityError("confirmation_required", "Ask the user to confirm the preview before publishing.");
    const pending = this.pending.get(confirmationId);
    if (!pending || pending.preview.kind !== kind) throw new CommunityError("preview_mismatch", "Prepare a preview of this publication kind in this MCP session first.");
    if (kind !== "forum_post" && !acceptedLicense) throw new CommunityError("agreement_required", "The user must accept the open-source/distribution and originality statements shown in the preview.");
    if (pending.result) return structuredClone(pending.result);
    if (pending.attempted) throw new CommunityError("already_attempted", "This submission was already attempted. Check the user's workspace/status before creating another publication.");
    const author = await this.backend.account(kind);
    if (author.id !== pending.preview.author.id) throw new CommunityError("account_changed", "The signed-in account changed. Prepare a new preview for the current user.");
    const files: VerifiedFile[] = [];
    for (const file of pending.preview.files) {
      const data = await readFile(file.path);
      if (digest(data) !== file.sha256) throw new CommunityError("file_changed", `${file.name} changed after preview. Prepare it again.`);
      files.push({ ...file, data });
    }
    // Lock synchronously after the awaits so two concurrent confirmations cannot both write.
    if (pending.attempted) throw new CommunityError("already_attempted", "This confirmation is already being submitted.");
    pending.attempted = true;
    try {
      const result = await this.backend.submit({ content: structuredClone(pending.preview.content), author, files, source: structuredClone(pending.preview.source) });
      pending.result = structuredClone(result);
      return result;
    } catch (error) {
      if (error instanceof CommunityError) throw error;
      throw new CommunityError("submission_failed", "Publication did not complete. Check the user's workspace before retrying; a request may already have reached the server.");
    }
  }
}
