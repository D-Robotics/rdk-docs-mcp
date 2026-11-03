# MCP Release Readiness Implementation Plan

> **For agentic workers:** Use the current runtime's plan-execution workflow to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将当前工作区整理为可验证、可由维护者发布的下一版 RDK Docs MCP，并保留现有未提交修改。

**Architecture:** 保持既有 MCP 工具、账号与确认流程；在预览阶段基于已读入并哈希绑定的文件字节校验 Skill 包与图片，完整展示 `SKILL.md`，对未知或已下架的社区状态保守报告。文档检索使用现有工作区修复，单独执行在线、离线和打包后的协议检查。使用 `0.4.2` 避免复用已经存在的 `mcp-v0.4.1` 标签。

**Tech Stack:** Node.js >=20、TypeScript、Vitest、MCP SDK、Node 内建 `zlib`；不新增依赖。

---

### Task 1: 锁定基线与真实接口

**Files:** `mcp/src/eval-live.ts`、`mcp/src/eval-skills-live.ts`、`mcp/src/community-publishing.ts`（检查，不覆盖已有改动）。

- [x] 执行 `npm --prefix mcp run verify`，记录结果：39 个测试文件、507 项测试和构建通过。
- [x] 以隔离缓存运行当前代码的在线文档检索，记录 57/57 通过；执行离线基准并保存临时报告。
- [x] 以隔离 HOME 和缓存执行 Skill 目录在线测试；记录首次网络失败，重试后 18/18 通过。
- [x] 使用本人会话验证案例、Skill、论坛三种无提交预览；复现普通文本冒充 `.zip` 仍通过预览。

### Task 2: 验证并展示 Skill 压缩包，拒绝伪造图片

**Files:**
- Create: `mcp/src/community-archive.ts`（仅解析内存中的 ZIP，不向文件系统解压）
- Modify: `mcp/src/community-publishing.ts`、`mcp/src/community-tools.ts`
- Test: `mcp/src/community-publishing.test.ts`、必要时新增 `mcp/src/community-archive.test.ts`

- [x] 先通过 `CommunityPublisher.prepare` 加入失败测试：`.zip` 扩展名的普通文本必须被拒绝，且不触发 `submit`。示例：

```ts
const path = join(dir, "invalid.zip");
await writeFile(path, "not a zip");
await expect(publisher.prepare({
  kind: "skill", display_name: "Example", description: "Example skill",
  category: "TESTING", developer_signature: "Author",
  contact_email: "author@example.com", version: "1.0.0", package_path: path,
})).rejects.toMatchObject({ code: "invalid_file" });
expect(api.submit).not.toHaveBeenCalled();
```

- [x] 实现 `inspectSkillArchive(data: Buffer)`：使用 Node 内建 API 检查 ZIP 中央目录、条目边界、单磁盘与受支持压缩方式，拒绝损坏、加密、路径穿越、重复及缺失 `SKILL.md`；限制条目数量和实际解压字节，不写入文件系统，完整返回唯一 `SKILL.md` 正文。显式拒绝无法安全验证的 ZIP64 或压缩格式，不静默截断正文。
- [x] 在预览中返回 Skill 文本和包内路径，并继续用原始压缩包字节计算 SHA-256；发布前现有哈希复核必须继续有效。
- [x] 针对正常 stored/deflate 包、非 ZIP、损坏包、缺失/重复 `SKILL.md`、超大解压内容、路径穿越和修改后重放添加行为测试。正常包使用版本控制中的字节 fixture，不依赖操作系统 `zip` 命令。
- [x] 案例封面及 Skill 图标先检查文件大小并核对 PNG、JPEG 或 WebP 文件标识与扩展名一致；测试伪造图片不能通过预览。文档说明图片标识检查不等于图片完整解码或内容安全审查。
- [x] 运行 `npm --prefix mcp test -- src/community-publishing.test.ts src/community-archive.test.ts`，再运行 MCP 预览协议测试。

### Task 3: 报告真实审核与可用状态

**Files:** `mcp/src/community-client.ts`、`mcp/src/community-client.test.ts`、`mcp/community.md`。

- [x] 先增加失败测试：Skill 已审核但 `availabilityStatus: "SUSPENDED"` 时不能返回 `published`；未知可用状态不能冒充发布成功。覆盖 `authorReviewStatus` 和旧 `reviewStatus`。
- [x] 把 `ACTIVE` + 最新版本审核通过映射为 `published`；`SUSPENDED` 映射为 `suspended`；缺失或未知可用性映射为 `unknown`。审核未完成、失败或拒绝保持准确状态，并在 `details` 保留原始状态。
- [x] 论坛排队回执保留 `pending_review`、`id: null` 和本人活动页，增加明确说明它暂不能用话题 ID 查询；不把审核队列 ID 或帖子 ID 冒充话题 ID。
- [x] 运行 `npm --prefix mcp test -- src/community-client.test.ts src/community-tools.test.ts`。

### Task 4: 检索回归及离线快照

**Files:** `mcp/src/routes.ts`、`mcp/src/routes.test.ts`、`mcp/src/rspress.ts`、`mcp/src/rspress.test.ts`、`mcp/eval/retrieval-cases.json`、`mcp/prebuilt/oe-llm-s600.json.gz`、相关 BM25 快照、`mcp/src/eval-live.ts`。

- [x] 先复现 `QAT set_fake_quantize`：测试具体 API 查询时，`fake_quantize.html` 不被通用量化概览抢占首位；再限定通用入口路由，只处理入门意图，保留现有安装与量化入口测试。
- [x] 为同一 Rspress 手册含 `latest` 与编号版本添加回归测试；以站点可证实的默认版本规则选择当前版本，不能无条件让数字最大版本覆盖 `latest`；维持现有 v1/v2 过滤测试。
- [x] 复核旧版 S600 Whisper 快照与现网 ASR 文档；只更新对应评测期望及经实测生成的该手册离线快照，不覆盖其他快照或把失效 URL 当成通过。
- [x] 在线评测保留索引失败原因，逐项捕获论坛等网络检查异常，不能把异常吞成成功；用受控失败测试区分网络错误和排序错误。
- [x] 运行受影响的 routes、Rspress、service 与 eval 测试；重新运行在线和离线评测。

### Task 5: Skill 目录升级与分类

**Files:** `mcp/src/skill-catalog.ts`、`mcp/src/skill-catalog.test.ts`、`mcp/src/skill-taxonomy-data.ts`、`mcp/src/skill-structured.test.ts`、`mcp/src/eval-skills-live.ts`。

- [x] 用旧版目录快照及当前审核分类表复现缓存升级后分类失效；确保旧快照不会悄然变成结构化搜索空结果，必要时刷新，刷新失败须报告真实状态。
- [x] 核对 `s-hbdk-compile` 的 QAT 分类和 S100 普通 ONNX 编译入口，按当前目录的实际 Skill 正文修正分类及排序，并增加结构化查询行为测试；不能把未知兼容性说成已验证。
- [x] 让在线评测从任一成功的目录响应记录 `catalog_revision` 和 `fetched_at`；此前失败仍保留失败结果，不改变退出码。
- [x] 运行 Skill 分类、目录、服务与结构化检索测试，并在网络可用时复跑在线评测。

### Task 6: 版本与可复现发布物

**Files:** `mcp/package.json`、`mcp/package-lock.json`、`mcp/CHANGELOG.md`、`mcp/scripts/verify-package.mjs`、`.github/workflows/release-mcp.yml`、发布说明文档。

- [x] 确认 npm `0.4.2` 和 GitHub `mcp-v0.4.2` 均不存在；执行 `npm --prefix mcp version 0.4.2 --no-git-tag-version`，同步版本及 lockfile，不创建 tag 或提交。
- [x] 保留原 `Unreleased` 的所有现有条目，整理为 `0.4.2` 并补充实际完成的预览与状态修复。
- [x] 在隔离副本复现 `verify-package.mjs` 忽略 `--tarball` 的问题；添加可选 `--tarball <path>`，指定路径缺失时失败，存在时安装并验证该文件而不是重新打包；报告被验证文件的 SHA-256。
- [x] Release 工作流在打包前运行在线文档与 Skill 目录验证，失败时停止发布；`npm pack` 后验证该同一 `.tgz`，再计算并发布校验文件；保持现有版本/标签校验和不覆盖已有附件的规则。
- [x] 记录发布前需对同一源码提交运行验证；GitHub Release 只上传附件，维护者随后对已验证的同一 `.tgz` 执行 `npm publish <tarball> --access public` 并检查 npm 版本。发布本身由维护者执行。

### Task 7: 独立审查后的发布保护

**Files:** `mcp/src/install.ts`、`mcp/src/install.test.ts`、`mcp/scripts/verify-package.mjs`、`mcp/src/verify-package.test.ts`、`mcp/src/eval.ts`、`mcp/src/eval.test.ts`、`.github/workflows/release-mcp.yml`、Skill 结构化检索文件。

- [x] 保持启动时更新已安装 Skill 的既有行为；内容不同时先创建不覆盖已有备份的备份，备份失败不能覆盖原文件，相同内容不产生备份。
- [x] 默认包验证在隔离副本中构建并打包，不能删除或覆盖工作区现有 `mcp/dist/`、`mcp/skills/` 与 `mcp/SKILL.md`；指定 tarball 时不构建源码；给构建/pack 工作目录和原文件保留行为加回归测试。
- [x] 在线发布门禁遇到线上索引失败及快照回退时失败并保留原因，即使快照有命中；Release 使用独立缓存。
- [x] 为明确排除 PTQ 或输入已量化模型的结构化查询增加排序回归，不得因普通 ONNX 请求的加分规则推荐相反流程。

### Task 8: 依赖告警与兼容性

**Files:** `mcp/package.json`、`mcp/package-lock.json`、受依赖升级影响的源码与测试。

- [x] 区分生产与开发依赖的审计结果，核对公告适用前提及可用修复版本，不使用 `npm audit fix --force`。
- [x] 先在独立副本验证现有直接依赖升级对编译、完整测试、MCP 协议和 Node 20 的兼容性；不新增依赖或更改用户配置。
- [x] 只有通过兼容验证且确实降低生产风险的依赖调整才合入工作区，重跑审计并明确记录未修复或不适用的项。

### Task 9: 最终验收

- [x] 基于当前工作树制作隔离副本，避免 `prepack.mjs` 删除或覆盖用户的忽略文件；在副本中运行 `npm ci --ignore-scripts`、`npm run verify`、`npm run eval:offline` 和 `npm run verify:package`。
- [x] 分别运行在线文档及 Skill 目录评测；输出实际通过数、暂态失败和最终结果，不将检索评测写成生成答案质量评测。
- [x] 用安装后的候选 tarball 通过真实 MCP 协议验证工具列表、版本、预览与输入错误；对有效和无效 ZIP 使用独立登录会话只做预览。
- [x] 复核全部实际 diff、版本、发布文档和工作区原有改动；不自动提交、推送、发布 npm 或社区内容。

## 最终证据与外部发布前提

- 2026-11-03：当前工作区和全新依赖副本均通过 43 个测试文件、705 项测试与 TypeScript 构建。
- 严格在线文档 57/57、Skill 目录 18/18；离线 hit@1 0.867、hit@3 0.933、MRR 0.900。
- 全量依赖及实际 tarball 安装后的生产依赖审计均为 0 告警。
- 最终候选包在 Node 20.0.0 下通过 MCP 连接、离线 ASR 检索、本人社区/论坛身份、三类预览和无效 ZIP 拒绝；未提交内容。
- npm dry-run 成功，0.4.2 与 mcp-v0.4.2 仍未占用；后续本人登录后 `npm whoami` 返回 `qiaolongli`，目标包权限为 `read-write`，npm 0.4.2 再次查询仍为 404；未执行真实上传。
- 新工作流还需在提交后的 GitHub Actions 执行；Windows 原生运行未在本机复验。
- 归档代码的独立审查子任务因接口安全过滤提前终止；未将其报告为独立审查通过。实现已完成本地自审、自动化测试与运行验证。
