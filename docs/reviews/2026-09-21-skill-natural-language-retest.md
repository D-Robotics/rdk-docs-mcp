# npm 0.1.12 Skill 自然语言复测

环境：本机已安装的官方 npm 0.1.12，通过 MCP STDIO 调用 search_skills。目录 revision：08d0a466413f11bbc045ba5e51f626bdb0346373。原始证据：/tmp/rdk-mcp-smoke/natural-query-results.json。

## 实测

| 查询 | 结果 |
| --- | --- |
| 量化模型 PTQ | 第一位 __SKILL_j6-plugin-__set-fake-quantize，第二位 x5-ptq-deploy；混入 S 系列内部技能 |
| X5 上把模型量化后部署 | ambiguous_quant；x5-router 第一，混入 S 系列；PTQ 专属技能被过滤 |
| 量化 | ambiguous_quant，返回 S 系列候选 |
| model zoo 预训练模型 | rdk-model-zoo 第一，后续为 integrate/release/review/develop |
| 现成的量化好的模型直接用 | 错误触发 ambiguous_quant，前五没有 Model Zoo |
| X5 PTQ 量化部署 | x5-ptq-deploy 第一 |
| 量化模型 PTQ + platform=x5 | 仍返回 S 系列 __SKILL_j6-plugin-* |
| quantization | no_match，未返回中文“量化”同样的歧义引导 |

## 根因核验与修复要求

1. P1：消费现成模型和执行量化混淆。skill-search.js 仅依据量化 token 与 PTQ/QAT 信号决定 ambiguousQuant，没有先区分“找已量化产物”与“执行量化”。需要先识别任务意图，再应用量化路径护栏；为模型库、现成模型、已量化模型等补概念别名。仅补别名不足以保证不被后续过滤。
2. “部署没有桥接到 deploy”的归因不成立：TASK_SYNONYMS 已有部署→deploy、量化→quant。自然语言句子没明确 PTQ，PTQ 技能被现有护栏主动排除；不能简单把该句强制解释成 PTQ。应保留澄清，并使候选限定到相关板卡。
3. P1/P2：板卡约束不完整。已有 platform 参数与 mentionedBoards；但 query 中的板卡只参与加分，没有自动成为过滤条件。显式 platform=x5 也无法排除未识别出板卡的 S 系列包。应使用有来源的 pack/platform 元数据，未知兼容性不可等同全板卡兼容。
4. P2：公开名称存在 __SKILL_* 内部标识。不能仅在 MCP 删除前缀，否则 get_skill 精确键可能断裂或冲突。需在上游规范 canonical name，或保留稳定 id 并分离 display name，验证 get_skill 与安装交接一致。
5. 补充：英文 quantization 无候选时变成 no_match，中文量化有 ambiguous_quant；应保持意图引导独立于候选是否命中。

## 建议验收

- “现成的量化好的模型直接用”“官方已经量化好的模型”“找模型库”优先发现 Model Zoo 入口，不要求用户选择 PTQ/QAT。
- “我想量化模型”“X5 上把模型量化后部署”保留必要澄清，不擅自决定 PTQ。
- 明确 X5 PTQ 时首选相应工作流；排除 QAT 专属及已知其他平台技能。
- 查询内板卡和显式 platform 均有测试；冲突时明确提示，不静默猜测。
- 名称展示、精确 get_skill、安装引导保持一致，重名可检测。
- 既有 !!! 空输入、PTQ/QAT 否定与比较场景不回归。
- 中英文表达分别覆盖；通过固定目录快照测试排序、排除项和 guidance_kind，再用实时目录验收。

本次仅完成复现与根因记录，尚未修改实现。此前 6 工具连通性冒烟通过不能代表自然语言推荐质量通过。
