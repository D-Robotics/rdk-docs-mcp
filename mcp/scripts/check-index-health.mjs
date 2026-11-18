#!/usr/bin/env node
/**
 * 每日索引健康检查（对应 metric H5 / A2）。
 *
 * 直接调用 MCP 自己的索引加载路径，检查的就是用户会遇到的东西：
 *   1. 索引能否加载（Docusaurus / Sphinx / Rspress 三种格式）
 *   2. 记录数是否为 0，或跌破包内快照基线的 INDEX_MIN_RATIO
 *   3. 静态索引的 last-modified 是否超过 INDEX_STALE_DAYS 天
 *
 * 用法：cd mcp && npm run build && node scripts/check-index-health.mjs
 * 环境变量：INDEX_STALE_DAYS（默认 14）、INDEX_MIN_RATIO（默认 0.8）
 * 有 fail 时退出码为 1，供 CI 告警。
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { MANUALS, origin } from "../dist/catalog.js";
import { loadIndexFromOrigin } from "../dist/service.js";
import { fetchText } from "../dist/http.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const prebuiltDir = path.resolve(here, "../prebuilt");
const staleDays = Number(process.env.INDEX_STALE_DAYS ?? 14);
const minRatio = Number(process.env.INDEX_MIN_RATIO ?? 0.8);

function baselineCount(id) {
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(prebuiltDir, `${id}.json.gz`)));
    const snapshot = JSON.parse(raw.toString("utf8"));
    return snapshot.docCount ?? snapshot.docs?.length ?? 0;
  } catch {
    return 0;
  }
}

/** 静态索引取 last-modified；Rspress 的索引哈希由构建产物决定，跳过。 */
async function freshness(manual) {
  if (!manual.indexPath) return { skipped: true };
  const url = `${origin()}${manual.indexPath}`;
  const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const lastModified = res.headers.get("last-modified");
  const ts = lastModified ? Date.parse(lastModified) : NaN;
  return {
    lastModified,
    ts: Number.isFinite(ts) ? ts : null,
    ageDays: Number.isFinite(ts) ? (Date.now() - ts) / 86_400_000 : null,
  };
}

/**
 * 站点首页的 last-modified ≈ 最近一次部署时间（每次部署都会重写首页）。
 * 索引由部署后的 workflow 生成，正常应比首页新；落后半天以上说明索引步骤没跑成。
 */
async function siteBuiltAt(manual) {
  if (manual.indexKind !== "docusaurus") return null;
  const url = `${origin()}${manual.basePath}/`;
  const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return null;
  const lastModified = res.headers.get("last-modified");
  const ts = lastModified ? Date.parse(lastModified) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

const manuals = MANUALS.filter((manual) => manual.searchable);
const rows = [];
let failures = 0;
let warnings = 0;

for (const manual of manuals) {
  const row = {
    id: manual.id,
    title: manual.title,
    live: null,
    base: baselineCount(manual.id),
    ageDays: null,
    status: "ok",
    notes: [],
  };

  try {
    const docs = await loadIndexFromOrigin(manual, fetchText);
    row.live = docs.length;
    if (docs.length === 0) {
      row.status = "fail";
      row.notes.push("0 条记录");
    } else if (row.base > 0 && docs.length < row.base * minRatio) {
      row.status = "fail";
      row.notes.push(`记录数 ${docs.length} < 基线 ${row.base} 的 ${Math.round(minRatio * 100)}%`);
    }
  } catch (error) {
    row.status = "fail";
    row.notes.push(`加载失败：${error.message}`);
  }

  try {
    const fresh = await freshness(manual);
    if (fresh.error) {
      row.status = "fail";
      row.notes.push(fresh.error);
    } else if (!fresh.skipped && fresh.ageDays != null) {
      row.ageDays = fresh.ageDays;
      const builtAt = await siteBuiltAt(manual);
      if (fresh.ts != null && builtAt != null && fresh.ts + 12 * 3_600_000 < builtAt) {
        row.status = "fail";
        const days = (builtAt - fresh.ts) / 86_400_000;
        row.notes.push(`索引比站点部署旧 ${Math.round(days)} 天`);
      } else if (fresh.ageDays > staleDays) {
        if (row.status === "ok") row.status = "warn";
        row.notes.push(`索引 ${Math.round(fresh.ageDays)} 天未更新`);
      }
    }
  } catch (error) {
    row.status = "fail";
    row.notes.push(`HEAD 失败：${error.message}`);
  }

  if (row.status === "fail") failures += 1;
  if (row.status === "warn") warnings += 1;
  rows.push(row);
}

rows.sort((a, b) => (a.id < b.id ? -1 : 1));

const lines = [];
lines.push("| 手册 | 记录数 | 基线 | 索引年龄 | 状态 | 备注 |");
lines.push("| --- | ---: | ---: | ---: | --- | --- |");
for (const row of rows) {
  lines.push(
    `| ${row.title}（${row.id}） | ${row.live ?? "—"} | ${row.base || "—"} | ${
      row.ageDays == null ? "—" : `${Math.round(row.ageDays)} 天`
    } | ${row.status === "ok" ? "✅" : row.status === "warn" ? "⚠️" : "❌"} | ${row.notes.join("；")} |`,
  );
}
lines.push("");
lines.push(`共 ${rows.length} 本手册：${failures} 失败，${warnings} 警告。`);

const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}
process.exit(failures > 0 ? 1 : 0);
