import { z } from "zod";

export const COMMUNITY_ORIGIN = "https://developer.d-robotics.cc";
export const FORUM_ORIGIN = "https://forum.d-robotics.cc";
export const kindSchema = z.enum(["case", "skill", "forum_post"]);
export type PublicationKind = z.infer<typeof kindSchema>;
const text = z.string().trim().min(1);
export const publicationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("case"), project_name: text, summary: text.max(200),
    category_codes: z.array(z.number().int().min(1).max(7)).min(1),
    platform_codes: z.array(z.number().int().min(1).max(5)).min(1),
    repository_url: z.string().url().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/),
    cover_path: text, video_embed: z.string().optional(),
  }).strict(),
  z.object({
    kind: z.literal("skill"), display_name: text.max(50), description: text.max(200),
    category: z.enum(["CODING", "TESTING", "DOCUMENTATION", "DESIGN", "DATA_ANALYSIS", "PRODUCTIVITY", "DEVOPS", "SECURITY", "OTHER"]),
    developer_signature: text.max(20), contact_email: z.string().email(),
    version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
    package_path: text, icon_path: text.optional(), icon_asset_key: text.optional(),
  }).strict(),
  z.object({
    kind: z.literal("forum_post"), title: text, markdown: text,
    category_id: z.number().int().positive(), tags: z.array(text).default([]),
    attachments: z.array(text).default([]),
  }).strict(),
]);
export type PublicationInput = z.input<typeof publicationSchema>;
export type PublicationContent = z.output<typeof publicationSchema>;
export type CommunityAccount = { id: string; username: string };
export type PublicationResult = { kind: PublicationKind; id: number | null; status: string; url: string | null; details?: unknown };
export type PublicationFile = { field: string; path: string; name: string; bytes: number; sha256: string };
export type VerifiedFile = PublicationFile & { data: Buffer };
export class CommunityError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = "CommunityError"; }
}
