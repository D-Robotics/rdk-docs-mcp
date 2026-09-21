# Skill 自然语言检索修复前后对照（2026-09-21）

分支：`fix/skill-natural-language-quality`（自 origin/main @ 11f943d）。规格：[2026-09-21-skill-natural-language-retest.md](./2026-09-21-skill-natural-language-retest.md)，计划：[2026-09-21-skill-search-quality.md](../superpowers/plans/2026-09-21-skill-search-quality.md)。

固定目录快照测试基于真实 rdk-skills 目录记录（revision `08d0a466413f11bbc045ba5e51f626bdb0346373`，与复测时相同）；实时 eval 当日复跑同一 revision。

## 修复前后对照（复测问题 → 现行为）

| 复测问题 | 修复前（npm 0.1.12） | 修复后 |
| --- | --- | --- |
| 「现成的量化好的模型直接用」 | 错误触发 ambiguous_quant，前五无 Model Zoo | top1 `rdk-model-zoo`，guidance_kind=default（意图=消费现成模型） |
| 「官方已经量化好的模型」「找模型库」「找预训练模型」「pretrained models ready to use」 | 同类误判或排序不稳 | top1 均为 `rdk-model-zoo` |
| 「不要现成模型，我要自己量化」 | 「现成模型」字样仍会把 Model Zoo 拉进候选 | 否定跨度内的 token 被剔除，Model Zoo 不出现在结果；保留 ambiguous_quant 澄清 |
| 「找预训练模型」因「训练」判 QAT | 「训练」子串计入 QAT 信号 | 「预训练」覆盖「训练」信号，不判 QAT；ready 入口排第一 |
| 「我想量化模型」「X5 上把模型量化后部署」「量化」 | 保留澄清（正确），但候选混入 S 系列 | guidance_kind=ambiguous_quant 保留；PTQ/QAT 专属技能不作为已决定答案 |
| quantization（英文） | 无候选 → no_match，丢澄清 | guidance_kind=ambiguous_quant 与中文一致，与候选有无解耦 |
| 「量化模型 PTQ」+ platform=x5 仍返回 S 系列 | pack 无板卡元数据，S 系列被当 board-agnostic | 按 pack 板卡家族（来源：rdk-skills README Supported Boards / Installation layers + workspace_dir/catalog_dir）排除；top1 `x5-ptq-deploy` |
| 「X5 上把模型量化后部署」混入 S 系列 | 查询内板卡只加分不过滤 | 查询内单一板卡自动成为默认约束；S 系列 pack 排除，top1 `x5-router` |
| query X5 + platform s100 | 静默按 platform 收窄 | guidance_kind=platform_conflict，空候选，指明两侧板卡；多板卡比较查询不被单板收窄 |
| `__SKILL_j6-plugin-__set-fake-quantize` 公开名 | MCP 直接暴露内部生成器名 | 新增 display_name（`j6-plugin-set-fake-quantize`）；`name`/`catalog_path`/`source_url`/安装数据原样保留，get_skill 与安装仍用精确 name；同 display_name 的不同记录均可精确获取 |

## 回归保留

- `!!!`、纯数字、纯语气词 → invalid_input；零可用 token 不参与排序。
- PTQ/QAT 显式选择、否定（「不用 QAT，直接 PTQ」「not PTQ」）与比较（「PTQ 和 QAT 有什么区别」）行为不变。
- 「X5 PTQ 量化部署」top1 仍为 `x5-ptq-deploy`；互斥路径排除不变。
- 通用 GPIO / Model Zoo 候选在板卡约束下保留（范围未知≠删除），`platform_scope=unknown` 明示不可当兼容证明。

## 测试与验证（退出码）

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `npm test`（vitest run） | 0 | 17 个文件 245 个测试全部通过（修复分支新增 31 个断言用例） |
| `npm run build`（tsc） | 0 | 无类型错误 |
| `npm run eval:skills`（实时） | 0 | 14/14 通过；目录 revision `08d0a466…`；新增 5 项检查全过（现成模型 top1、X5 排除 S pack、英文 undecided、platform_conflict、display_name） |
| `npm run eval:live`（实时） | 0 | 57/57 检索检查通过 |

新失败测试先行：任务 1/2 验收测试在实现前运行确认为 13 failed / 23 passed，实现后全部转绿。

## 剩余限制与未覆盖事项

1. **上游 canonical name 归一化未在本 PR 修改**：`__SKILL_<family>-__<slug>` 前缀由 rdk-skills 生成器产生，需上游规范；本 PR 仅做展示层清理，canonical name 始终是 get_skill/安装的精确键。
2. **pack 板卡家族映射是集中维护表**：pack registry 无 platform 字段，映射来源已注释（README 表 + workspace_dir + catalog_dir 推导）；新 pack 若目录字段无板卡信息则为 unknown 范围，不会被排除也不会被声称兼容。上游在 pack registry 增加 platform 字段后可删表。
3. **意图规则是短语级**：覆盖复测报告全部场景，但极端措辞（如未见过的口语化表达）可能落入 other/澄清；混合「现成+自制」措辞给澄清而不猜测，这是设计取舍。
4. **未知 platform 字符串**仍按「每个 token 必须出现在记录文本」的旧严格规则过滤，未板卡化。
5. **实时 eval 依赖当日 rdk-skills HEAD**：revision 与复测一致（08d0a46）；上游内容变化时以固定快照测试为准。
6. rdk-skills 仓库结构改动（如描述措辞变化影响触发词）属上游事项，未在本 PR 处理。
