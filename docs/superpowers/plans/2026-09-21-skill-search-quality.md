# Skill Search Quality Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans if available to implement task-by-task. User explicitly authorizes Claude Code implementation and a new PR; do not stop for repeated plan approval.

**Goal:** 用户用中文描述任务时得到正确的 Skill 候选与澄清指引，避免把消费现成模型误判为执行量化。

**Architecture:** 在现有确定性检索中增加任务意图分析，再应用板卡约束、概念词和排序；保留既有 PTQ/QAT 护栏。公开结果新增友好展示名但保留 canonical name，保持 get_skill 和安装交接兼容。不增加向量数据库、LLM 调用或新外部服务。

**Tech Stack:** TypeScript, Node >=20, Vitest, MCP SDK.

**Spec:** docs/reviews/2026-09-21-skill-natural-language-retest.md（执行时一并复制到分支）。

## Global Constraints

- 从最新 origin/main 新建隔离分支；PR #6/#7 已合并，不复用旧分支、不重开已关闭 Issue。
- 仅修改 rdk-docs-mcp；上游 rdk-skills 的结构改动另记后续事项。
- 不合并、不发布 npm、不改真实客户端配置、不实际安装发现的 Skill。
- 保持 name 精确键与现有安装指引，新增字段只做兼容性扩展；不要通过删前缀改写身份。
- 不维护固定 Skill 排名白名单，不把分数宣称为兼容性证据。
- 用失败用例驱动修复，测试完整候选集合、排序与 guidance_kind；不能只检查有返回值。

## Review Focus

1. 否定：“不要现成模型，我要自己量化”不能路由 Model Zoo（任务 1）。
2. 预训练不是 QAT：“找预训练模型”不能因“训练”自动判 QAT（任务 1）。
3. 查询与参数冲突：query X5 + platform S100 不能静默推荐（任务 2）。
4. S 系列 pack 内部 j6 名称不等于 board-agnostic；未知不是兼容证明（任务 2）。
5. 清理后的同名展示不影响 canonical name 精确查询及安装（任务 3）。

## Task 1: Intent-aware search and quantization guidance

Files: mcp/src/skill-search.ts, mcp/src/skill-search.test.ts; 可新增 mcp/src/skill-intent.ts 将语义规则集中管理。

- [ ] 在现有真实目录结构的固定 fixture 中增加以下断言，运行 `npx vitest run src/skill-search.test.ts` 确认修复前失败。

```ts
// 按现有测试 fixture 命名接入；每个 query 独立参数化。
const readyQueries = ['现成的量化好的模型直接用', '官方已经量化好的模型', '找模型库', '找预训练模型', 'pretrained models ready to use'];
// 对 readyQueries：top 1 为 Model Zoo 用户入口，guidance_kind !== ambiguous_quant。
const undecidedQueries = ['我想量化模型', 'X5 上把模型量化后部署', '量化', 'quantization'];
// 对 undecidedQueries：guidance_kind === ambiguous_quant（即使无候选）；不把 PTQ/QAT 专属流程作为已决定答案。
// 否定：不要现成模型，我要自己量化 -> ambiguous_quant，不能因“现成模型”路由 Model Zoo。
// PTQ/QAT 比较与否定保留原有断言；“X5 PTQ 量化部署”第一项为 x5-ptq-deploy。
```

- [ ] 实现明确阶段：原始 query 的肯定/否定任务短语 -> intent -> 概念 token -> 排序与过滤。intent 至少区分 ready_model、quantize、other；不使用单独“量化”决定 ready_model。现成模型和自制量化混合且不能确定时给澄清，不猜。
- [ ] 为模型库/model zoo、现成/已量化模型补概念桥接；Model Zoo 使用者入口优先于 release/review/develop 维护者流程，基于任务与目录元数据而非手写目标 Skill 白名单。
- [ ] 将指导语选择与候选有无解耦；真正不确定的量化请求无候选时仍保留 PTQ/QAT 澄清。
- [ ] 跑针对性测试并提交一个可审查的 commit。

## Task 2: Platform scope and conflict handling

Files: mcp/src/skill-search.ts, mcp/src/skill-catalog.ts, mcp/src/skill-service.ts，以及对应 *.test.ts；若需要类型新增则 mcp/src/types.ts。

- [ ] 增加失败断言：`量化模型 PTQ` + platform=x5 不含已知 S 系列 pack；`X5 上把模型量化后部署` 不含已知 S 系列 pack；通用 GPIO/Model Zoo 候选不因缺板卡名被全部删除。
- [ ] 增加冲突断言：query='X5 PTQ'、platform='s100' 返回明确 conflict guidance 和空候选；多板卡比较不得擅自收窄为单板卡。
- [ ] 检查当前 pack registry 的可用元数据；优先由目录元数据得到系列范围。无明确字段时允许一个有出处、集中维护的 pack 系列映射（非 Skill 白名单），记录来源；不能从任意字符串 S 或 j6 猜测 X5 兼容。
- [ ] 从 query 提取明确板卡作为默认约束，与显式 platform 一致性校验。保留通用候选；未知范围可保留但明确范围未知，不能称已兼容。
- [ ] 测试 query/参数两条入口，检查 service 输出，提交。

## Task 3: Stable identity with readable display names

Files: mcp/src/skill-service.ts, mcp/src/types.ts（如适用）, mcp/src/skill-service.test.ts, mcp/src/skill-server.test.ts。

- [ ] 建立真实 `__SKILL_j6-plugin-__set-fake-quantize` fixture，先断言 search/get 均有 display_name 且 name 原样保留。
- [ ] 实现局限于已知生成器格式的展示名清理，保留 name、catalog_path、source_url 与 installation 数据；精确查询继续用 name。
- [ ] 两个同展示名、不同 canonical name 的记录必须都可精确获取，不用展示名做索引、不静默选其中一个。
- [ ] 明确说明上游 canonical name 归一化未在本 PR 修改；测试 get_skill 和 workspace 安装交接未破坏；提交。

## Task 4: MCP end-to-end acceptance and documentation

Files: mcp/src/skill-server.test.ts, mcp/src/eval-skills-live.ts, skills/rdk-docs/SKILL.md, README.md。

- [ ] 在 MCP 协议层执行任务 1/2/3 关键用例，覆盖真实参数及返回结构；保留 !!!、纯数字、PTQ/QAT 否定与比较回归。
- [ ] 补实时 eval：中文现成模型 top1、X5 明确 PTQ、未决定量化 guidance、板卡排除。输出目录 revision；实时失败不能写成成功。
- [ ] 更新 Skill 指引：展示 display_name，精确 get_skill 用 name；未知板卡先澄清；区分消费模型与制作模型；不要要求 Agent 通过换英文关键词来掩盖服务端问题。
- [ ] 执行 `npm test`、`npm run build`、`npm run eval:skills`、`npm run eval:live`，分别保留退出码及真实结果。
- [ ] 写修复前后对照报告，记录测试数、目录 revision、剩余限制。git diff 检查只含此次文件。
- [ ] 推送新分支，对 main 创建 PR；正文说明用户场景、修复策略、测试证据与上游限制，不关闭旧 Issue 或自动合并。

## Delivery

返回 PR URL、分支、最终 SHA、工作区路径、测试摘要及剩余问题。必须真正提交 PR，不能仅输出建议命令。若阻塞，报告可复现原因与已完成内容。
