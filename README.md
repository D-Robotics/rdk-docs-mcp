# RDK Assistant MCP

为 AI Agent 提供 RDK 官方文档检索、Skill 发现、来源核验和安装引导。对外名称为 **RDK Assistant MCP**；npm 包名、命令和配置 id 保持兼容：`rdk-docs-mcp` / `rdk-docs`。

模型自己记不住板端手册里的烧录步骤、接口名和版本号。这个仓库把官方文档变成 **MCP 工具 + Skill**：Agent 先搜手册，再打开原文回答，并带上可点击链接。

适用于 Cursor、ZCode、DeepSeek Harness、Claude Code、Claude Desktop、VS Code Copilot，以及任何支持 [MCP](https://modelcontextprotocol.io/) 的 Agent。

## 给 Agent 的安装句（对外只留这一行）

把下面这句话复制给当前 AI：

```text
根据 https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/install.md 安装 RDK 文档检索。
```

Agent 会拉到安装剧本，执行 `npx -y rdk-docs-mcp@latest --install`，写入 MCP + Skill。不要把 JSON 或仓库地址发给用户。源码仓库可以 private；安装物是 npm 包。

装完后重载 MCP / 重启会话，并调用 `get_status` 核对实际运行版本。默认安装使用 `@latest`；自定义固定路径或固定版本的配置需要更新其实际安装。已安装 Skill 在下次服务启动时由当前包刷新，每个文件以原子替换方式更新。

jsDelivr 不可用时，同一文件在：

`https://unpkg.com/rdk-docs-mcp@latest/install.md`

## 价值和功能

**解决什么问题**

- 问「X5 怎么烧录 / TROS 某节点怎么启 / XBurn 支持哪些板」时，不再靠过期训练数据。
- 同一套能力可以装进不同 Agent，不用为每个 IDE 重写爬虫。

**七个工具**

| Tool | 做什么 |
|------|--------|
| `get_status` | 查询当前运行版本、支持字段及可选的目录分类健康状态，不安装 Skill |
| `list_manuals` | 列出资料中心已上架手册（X/S 系列、TROS、Model Zoo、Studio、XBurn、OE、X5 SDK 等） |
| `search_docs` | 中英文关键词检索。指定手册只搜那一本；不指定时手册为主、论坛至多作补充。`forum` 只搜社区。 |
| `get_page` | 读取官方文档或论坛主题，标注正文来源，支持带内容哈希校验的分段续读 |
| `list_toc` | 列出某一本手册的页面目录；`forum` 列出「开发与问题」和「通用」最近帖 |
| `search_skills` | 在 [D-Robotics/rdk-skills](https://github.com/D-Robotics/rdk-skills) 目录快照里按任务找 Skill（只读，带 `catalog_revision` 溯源） |
| `get_skill` | 按目录精确名称返回 Skill 详情与安装引导：flat 给 `npx skills add ...`，workspace 给整包交接（Pack repo/ref/verify_paths + `rdk-pack-installer` 获取入口） |

**三个 bundled Skill**

- `rdk-docs`：规定 Agent **先搜再打开页面**；手册是规范、答案主体，论坛只作补充参考，必须附可点击链接。
- `forum-post`：把图文/视频发到[社区论坛](https://forum.d-robotics.cc/)（SSO 登录、composer 发帖、上传与编辑）。浏览器路线需要本机已装 [agent-browser](https://github.com/vercel-labs/agent-browser) CLI；发帖要用户自己的论坛账号。MCP 本身永远只读，写入只发生在 skill 驱动的浏览器/API 流程里。
- `article-writer`：把一段工作写成可发布的中文技术文章并渲染成带配图的 HTML。

`--install` 会把三个 skill 一并写入本机各客户端的 skills 目录；已安装的 skill 在 **MCP 启动时** 随新版本自动刷新。

**不覆盖**

- 旧版资料 `https://developer.d-robotics.cc/information` 不在索引里。
- 论坛内容默认走 MCP：`search_docs` 带 `source=forum`（只要社区）或 `source=all`（手册为主、论坛补充）；`get_page` 可直接读公开论坛帖。MCP 论坛检索失败或 0 命中时，才直接 GET Discourse 公开 JSON 兜底。论坛帖子不当官方规范，不要爬论坛 HTML。
- 不需要登录，也不写入文档站或论坛。

**Skill 发现（只读）**

用户问「X5 40PIN GPIO 有没有现成 Skill」「X5 PTQ 量化部署怎么做」「有没有现成量化好的模型」这类工具/工作流问题时，Agent 调 `search_skills`，再对候选调 `get_skill` 核对，最多推荐 1–2 个：

- **目录里有 ≠ 本机已安装。** 两个工具只读：不安装、不执行上游脚本、不读写用户 Skill 目录。
- flat 型 Skill 的安装入口是 `npx skills add d-robotics/rdk-skills --skill <name>`（装整个 Skill 目录）。
- workspace 型（OE 工具链类）必须整包安装：交接 `rdk-pack-installer`、需要项目根目录、按 `verify_paths` 校验，不能只复制单个 SKILL.md。
- 调用方先检查 `tools/list`，可用时调用一次 `get_status`，按实际支持的字段调用。旧版本缺少结构化能力时说明升级需求，不能向它发送新参数并假定已生效。
- 调用方模型负责理解目标、排除、条件和复合任务，再传 `task`、`platform`、`exclude_platforms`、`workflow`；query 仅排序。纯事实仍查官方文档。复合任务分开检索，多板卡分别调用。
- `task`: camera/gpio/uart/ready_model/model_conversion/model_compile/model_deploy/model_maintenance/environment/network/diagnostics/bsp。`workflow`: ptq/qat/undecided，仅适用于 model_conversion；不确定时只返回入口并澄清。
- 优先读取同一目录 revision 内的 `discovery` 元数据；缺失时使用带来源和完整指纹的本地审核分类。无效声明不会退回旧分类，内容变化后旧分类失效。`metadata_health` 分别报告未分类、过期、无效和未知板卡范围；不把这些情况说成“没有对应 Skill”。生产者格式见 [分类合同](docs/skill-discovery-metadata.md)。
- 平台明确时使用分类表已审核的系列范围，缺失则 platform_scope=unknown；范围匹配不是电气/型号兼容保证。平台支持 x3/x5/s100/s100p/s600/ultra，比较请求拆分。目标与显式排除冲突才报 platform_conflict，正文不会覆盖结构化条件。
- 旧 query-only 接口保留原有候选检索行为，并返回 legacy_query 警告；不再承诺理解复杂自然语言。新流程不能回退到旧接口绕过明确约束。
- 已有产物只编译用 `model_compile`，不强制选择 PTQ/QAT；联网用 `network`，工具链准备用 `environment`。`role` 可筛入口、完整流程或单步辅助。`category_only` 表示只符合大类，需重新核实相关性。
- `get_skill(include_content=true)` 返回绑定目录 SHA 的正文；正文不可用会明确标记，不能把摘要当成已读正文。flat 安装仍由安装器选择版本，实际执行前后要核对来源与内容。
- 展示层用 `display_name`（清理生成器的 `__SKILL_<family>-__<slug>` 内部格式），`get_skill` 与安装命令仍用 `name` 精确名；同 display_name 的不同记录靠 `name` 区分。
- 目录数据来自 rdk-skills 的生成索引（`skill-index.json` + `pack-registry.json`），本 MCP 不维护第二份清单；pack 板卡家族映射取自该仓库 README 的 Supported Boards / Installation layers 表（快照 revision 溯源）。上游 canonical name 归一化（去掉 `__SKILL_` 前缀）需在 rdk-skills 侧规范，本 MCP 仅做展示层清理。

---

## 开发者本机（不对外）

对外安装走上面的 URL，不要让用户 clone。本机改代码时：

```bash
cd mcp && npm install && npm test && npm run build
```

本地 Plugin symlink（开发调试）：

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn "$(pwd)" ~/.cursor/plugins/local/rdk-docs
```

手动合并 MCP 片段见 `examples/*.mcp.json`（均已是 `npx -y rdk-docs-mcp@latest`）。

---

## 给 Agent 的使用约定

用户问 RDK / TROS / 烧录 / 量化等问题时：

1. `search_docs`（能确定产品就带 `manual`，如 `x5`、`tros`、`xburn`；只要社区就 `source=forum`，兼容写法 `manual=forum`）
2. 对 1–2 个命中 URL 调用 `get_page`（手册或 `forum.d-robotics.cc` 主题）
3. 用原文回答，并附上官方文档或论坛链接

不要凭记忆编 `apt` 包名、镜像版本或管脚复用。

### 证据与限制（必读）

- **含图的信息不算已读。** 部分页面（如 [管脚定义与应用](https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/01_40pin_user_sample/40pin_define)）把完整管脚表放在图片里，`get_page` 即使返回 `truncated=false` 的完整 Markdown，正文也没有逐针参数。涉及引脚 / 电平 / 电源时，要打开或展示页面里的官方图片，不要拿其他型号的针脚表推断。
- **长页先看 `truncated` 字段。** `truncated=true` 表示正文被截断（末尾有截断提示）；需要后文就加大 `maxChars`（上限 40000）重读，仍不完整就明确说明只读到部分内容。
- **官方页面之间的数值冲突不在 MCP 里裁决。** 已知一例：RDK X5 的 40PIN 电源负载，[硬件简介](https://developer.d-robotics.cc/rdk_x_doc/Quick_start/hardware_introduction/rdk_x5)写 1A @3.3V / 1A @5V，[管脚定义与应用](https://developer.d-robotics.cc/rdk_x_doc/Basic_Application/01_40pin_user_sample/40pin_define)写 800mA @3.3V / 500mA @5V。MCP 忠实返回两处原文；Agent 应引用差异并建议以文档维护者的确认为准，不要自行下兼容性结论。此项已转交官方文档维护者核实。

---

## 开发

```bash
cd mcp
npm install
npm test
npm run eval:live
npm run eval:skills
npm run build
```

`eval:live` 用真实开发问题打资料中心（搜 + 拉页）。对标 ESP / Jetson MCP 的结论见 `docs/eval-vs-esp-jetson.md`。`eval:skills` 起真实 stdio MCP 连接打 rdk-skills 在线目录，验证六个工具与 flat/workspace 安装引导（需要网络；用隔离 HOME/缓存目录，不碰用户配置）。

索引缓存：`~/.cache/rdk-docs-mcp`（可用 `RDK_DOCS_CACHE_DIR` 覆盖），默认 TTL 24 小时。官方改文档后，缓存过期会重新拉最新索引；要立刻跟上就删掉缓存目录，或设 `RDK_DOCS_CACHE_TTL_MS=0`。

Skill 目录缓存是同一目录下的独立快照文件 `skill-catalog-snapshot.json`：一次刷新先取 rdk-skills 默认分支 commit SHA，再按同一 SHA 拉索引与 Pack 注册表两份 JSON，校验通过后原子替换；损坏视为 miss 重取，过期后刷新失败会明确报「目录不可用」，不回退旧数据。它和文档索引缓存互不影响，也和「MCP 启动时刷新已安装 bundled Skill」是两回事（后者只覆盖本包自带的 rdk-docs/forum-post/article-writer 三个 Skill 的既有安装，见 `mcp/src/install.ts`）。

S 系列 OE / OE LLM 是 Rspress 站点：不写死 `search_index.*.json` 的哈希，每次从首页 JS 里发现当前文件名，所以站点发版后哈希变了也能搜。资料中心**新上架一本手册**时，还要在 `mcp/src/catalog.ts` 加一条（并补 `eval/cases.json`）。

契约见 `SPEC-rdk-docs.md`。MCP / Plugin / Skill 三者关系见 `mcp-plugin-skill.md`。

## 许可与来源

MIT。文档与帖子版权归 [D-Robotics 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 与 [社区论坛](https://forum.d-robotics.cc/) 原站。本仓库只提供检索与阅读适配，不镜像整站。


## 维护与验收

- `npm run verify`：离线单元/协议回归及构建。
- `npm run verify:package`：打包、安装到临时目录，验证实际产物的工具 schema、版本和配套 Skill；诊断不会刷新用户 Skill。
- `npm run verify:live`：官方站点与 Skill 目录联网检查；外部限流单独报告。
- PR 的 CI 在 Linux/Node 20 与 Windows/Node 22 运行离线检查和包验证。联网检索成功不等于最终回答或实物操作已验证。
