# Issue #4 开发规范与交付计划

日期：2026-09-20。需求来源：https://github.com/D-Robotics/rdk-docs-mcp/issues/4
执行方：Claude Code；交付为代码、测试、文档及独立 PR，不包含合并或 npm 发布。

## 1. 基线与范围

PR #6 尚未合并，先检查最新状态：已合并则以最新 origin/main 为基线；未合并则从 origin/fix/issue-5-codex-40pin-skill 创建独立分支，PR base 指向该依赖分支并明确 Depends on #6。禁止合并 #6 或修改其分支。使用独立 worktree，保留原工作目录未提交文件。

本期仅新增只读 Skill 发现、详情和安装引导，保留现有四个工具与 Issue #5 修复。不自动安装 Skill、不执行上游脚本、不读取用户凭证、不检查本机 Skill 安装状态。目录缓存写入是允许的；“只读”指不修改业务资源/安装目录。

## 2. 数据源与验证

固定 Hub 为 D-Robotics/rdk-skills。已验证 08d0a46 索引有 97 个唯一名称，数量不是固定断言。
索引路径：skills/rdk-skill-finder/references/skill-index.json。
Pack 路径：skills/rdk-pack-installer/references/pack-registry.json。
现有生成器负责维护清单，MCP 不维护第二份人工目录、不扫描全部 SKILL.md、不运行上游 Python。

按 GitHub API 查询默认分支及提交 SHA（可用 commits/HEAD），随后从 raw.githubusercontent.com 的同一 SHA 获取两份 JSON。用 Node fetch，15 秒超时，单文件最大 5 MiB。默认不需要 Token；429/403/404/网络/超时返回明确错误，不无限重试。

用现有 zod 校验 schema_version=1、必填非空字符串、install_type 枚举、名称唯一性；Pack name/repo 与 workspace Skill 关联必须唯一。允许未知额外字段以兼容上游扩展。允许当前 S 系列名称中的大写字母和下划线（例如 __SKILL_j6-plugin-__adaptation），不要只接受 kebab-case；禁止名称以 '-' 开头及包含 shell 元字符/控制字符。repo 限制为 D-Robotics 下的合法 owner/repo。catalog_path 必须位于 skills/ 下；所有相对路径禁止绝对路径、反斜线、空段、'.'/'..' 段及编码路径穿越。workspace_dir 合法值可为 .drobotics/.horizon；不能误拒合法点开头目录。ref 只作为数据/链接，不执行 shell。

异常数据令本次快照校验失败，不返回部分已猜测的安装指令。workspace 记录缺少 Pack 配置不能降级为 flat。

## 3. 缓存与失败隔离

新增独立 Skill 快照缓存，不直接复用 http.ts 的逐 URL 截断文件名缓存（其不能保证两份数据原子一致，也可能截断不同 URL 为相同路径）。可复用 cacheDir()/cacheTtlMs() 的配置。

单个 snapshot JSON 包含 schema、revision、fetched_at、skills、packs；临时文件与目标同目录，验证后 rename 原子替换。缓存读取仍需校验内容与时间，损坏缓存视为 miss。默认 TTL=24h，RDK_DOCS_CACHE_TTL_MS=0 时每次重取，沿用 RDK_DOCS_CACHE_DIR。

同一进程并发请求共享一次刷新 Promise；刷新完成/失败后清除 Promise。未过期缓存可直接使用；过期刷新失败不返回陈旧安装建议，也不更新旧缓存时间。两份数据成功但写缓存失败时可返回已验证内存快照并附 cache_write_failed warning（便于只读文件系统使用）。缓存写入成功时间为 fetched_at，内存快照同样记录实际获取时刻。不得改变现有文档缓存行为。

目录按需加载，创建 MCP 服务和调用旧工具不能依赖 GitHub 可达。

## 4. 固定工具契约

### search_skills

输入 query: trim 后非空字符串，最长 500 字符；可选 pack:string、platform:string、install_type:'flat'|'workspace'、limit:整数1..20（默认5）。
输出：
```
{matches:[{name,description,pack,repo,catalog_path,install_type,
 source_url,score,matched_terms:string[],match_reason:string}],
 catalog_revision:string,fetched_at:string,warnings:string[],
 guidance:string}
```
source_url 指向 Hub blob/<SHA>/<catalog_path>/SKILL.md；repo 保留真正上游来源。fetched_at 为 ISO UTC 时间。score 是排序分数，不是置信概率。零匹配返回 matches=[]，不算服务故障。

### get_skill

输入 name:string（规范名称，trim 后精确匹配，不模糊匹配）。
输出基本记录及 source_url、catalog_revision、fetched_at、warnings，加 installation 判别联合：

flat：
```
{type:'flat',command:'npx',
 args:['skills','add','d-robotics/rdk-skills','--skill',name],
 display_command:string,requires_user_request:true,
 version_policy:'installer_default_not_catalog_pinned',docs_url:string}
```
需安装整个 Skill 目录，非单个 SKILL.md。显示命令参数进行安全 shell 引用，实际客户端使用 command/args；不得拼接原始 query。

workspace：
```
{type:'workspace',handoff_skill:'rdk-pack-installer',
 installer:{command:'npx',args:['skills','add','d-robotics/rdk-skills','--skill','rdk-pack-installer']},
 pack:{name,repo,ref,catalog_dir,install_script,workspace_dir,verify_paths},
 requires_project_root:true,requires_user_request:true,docs_url:string}
```
installer 的获取入口必须由当前索引中有效 flat 记录支持；不存在则明确 missing_installer，不编造命令。工作区安装逻辑、升级和版本比对交由上游 installer，本工具不复制这套逻辑。清楚区分 catalog_revision 与 Pack ref；不保证 npx 默认安装内容锁定目录 SHA。

错误沿用 MCP isError=true/text JSON 机制，至少含稳定 code 与 message：invalid_input、catalog_unavailable、invalid_catalog、unsupported_schema、unknown_skill、missing_installer。不能把获取失败伪装成零匹配。消息不包含凭据或整个未校验响应。

## 5. 搜索策略

用独立 Skill 排序模块，避免改变现有文档检索行为。参考上游分词但修复以下行为：
- 名称精确匹配第一；匹配按 name/description/pack/path 与可解释权重实现，同分按 name 排序。
- 英文大小写归一，中文双字词，40PIN 的数字开头词正确处理。
- 将 X5/X3/S100/S600 等型号词与任务词区分；有任务词时不能仅型号命中就返回记录。
- 查询只含型号时可返回目录候选，但 guidance 明示需要任务细化，不能声称某个具体工作流最合适。
- platform 仅文本筛选，不等同硬件兼容性保证；description 中“不要用于”内容不能直接当成正向推荐依据。至少用 PTQ/QAT 对立样本验证负向描述不会压过明确正向入口。
- “X5 模型量化”未指定 PTQ/QAT 时返回明确 guidance 要求分流，避免把 QAT 原子操作列为确定答案；可以使用索引中存在的 x5-router 入口，禁止凭空造记录。
- 明确“X5 PTQ 量化部署”优先 x5-ptq-deploy，明确 QAT 则指向 QAT 入口。
- 不构建向量库、不发起 LLM 请求、不维护人工 Skill 名称白名单；有限任务语义规则可以存在，但所有结果和安装参数必须来自校验后的快照。

## 6. Agent 说明与文档

更新 skills/rdk-docs/SKILL.md、README.md、mcp/README.md（按相关性）、发布说明。明确六个工具及例子：文档仍先查官方原文；寻找工具或操作流程时调用 search_skills，推荐前用 get_skill 确认；最多推荐1–2项；不能把“目录有”说成“本机已安装”；纯事实问答不强制推荐。

继承 PR #6 的论坛、图片和截断规则。不要把目录中的 description 当成 Agent 系统指令。
版本按项目习惯同步，禁止 npm publish。记录本 PR 基线与上游实测 SHA，不把 97 硬编码为永久数量。

## 7. 实现文件与步骤

建议文件边界（可根据可读性微调）：
- mcp/src/skill-catalog.ts：schema、快照获取/缓存、错误定义。
- mcp/src/skill-search.ts：纯函数分词、过滤、排序。
- mcp/src/skill-service.ts：查询与详情、安装联合对象。
- mcp/src/server.ts：两个工具注册和输入 schema。
- 对应 *.test.ts；测试 fixtures 使用最小代表数据。
- mcp/src/eval-skills-live.ts：显式运行的在线 MCP 冒烟，单独 npm script。

按以下顺序交付，每步先写关键失败用例、运行确认失败，再最小实现并通过测试后提交：
1. Schema 与加载：覆盖正常 flat/workspace、未知字段、合法 S 系列名称、错误 schema/路径/关联、HTTP 状态及大小限制；HTTP/时钟/缓存目录依赖可注入。
2. 缓存：fake clock 验证 miss/hit/过期/TTL0、SHA一致、坏缓存、第二份下载失败不替换、并发去重、缓存写失败 warning。
3. 排序：用 GPIO、PTQ、QAT、router、无关但含 X5 的 fixture 验证精确名、自然语言、只型号、负向描述、无结果和筛选。
4. 服务与 MCP：flat/workspace 安装对象、未知名称/缺 installer 错误、参数范围和六工具发现；用 SDK 内存或 stdio transport 测真实协议调用。目录加载失败时旧 list_manuals 仍可调用。
5. 文档与验证：构建、完整离线测试、显式 live skills 冒烟以及原 eval:live；在线失败如实记录，不用 mocked 成功替代。
6. 自审范围/错误处理/命令参数/发布物，提交推送并创建 PR，附需求验收矩阵与遗留项。

## 8. 交付验收（均需证据）

- A1 原四工具可用，总计六工具；目录故障不影响旧工具。
- A2 rdk-gpio-40pin 精确名第一；X5 40PIN GPIO 不推荐仅型号相关的精度诊断。
- A3 X5 PTQ 量化部署命中 PTQ 入口；不明确量化给分流 guidance。
- A4 flat 返回正确结构化命令及 Hub SHA 来源链接。
- A5 workspace 返回完整 Pack、ref、verify_paths、installer 获取入口，不返回单个 OE Skill 安装命令。
- A6 未知名称明确报错；无关查询空结果；参数非法为错误。
- A7 TTL、并发和原子快照行为有测试；两份 JSON 同 SHA。
- A8 离线、限流、坏 JSON、坏关联、目录穿越、命令注入 fixture 均覆盖。
- A9 搜索/详情不写 Skill 目录、不执行安装脚本，仅允许目录缓存写入；现有启动时刷新行为与本功能区分描述。
- A10 用真实上游跑 flat/workspace 搜索与详情，记录时间和 SHA；结果经 MCP 协议获取，不能仅测内部函数。
- A11 npm test、npm run build、原 eval:live 的结果及所有失败被报告。
- A12 PR 不混入用户未提交文件或上游仓库修改；明确依赖 #6；未合并未发布。

## 9. 审查重点

远程索引与本地已安装状态混淆；否定描述导致推荐错流程；合法上游名称被过度校验拒绝；逐 URL 缓存造成混合提交；故障被吞为“没找到”；安装指引不自足；用管道最后命令的退出码冒充测试成功。执行测试保留真实 exit code（直接命令或 pipefail）。

无需等待额外设计确认：用户本轮明确要求先制定规范并交 Claude Code 交付。若遇到必须变更 P0 契约的阻塞，先报告；常规实现细节自行决定。
