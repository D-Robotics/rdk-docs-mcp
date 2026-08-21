# SPEC: RDK 资料中心 Plugin

## Done 的定义

在 Cursor 里装上本仓库作为本地 plugin（或 `.cursor/mcp.json` 直连）后，Agent 能完成这条闭环：

1. 用户问「RDK X5 怎么烧录 / TROS 某个节点怎么用 / XBurn 支持哪些板」这类文档问题。
2. Agent **先搜文档再回答**，回复里带上资料中心的真实 URL。
3. 需要细节时能把某一页正文拉下来，而不是凭训练数据编。

可判定验收：

- `list_manuals` 返回资料中心门户上当前已上架的手册（至少 15 本，含 X/S 系列、TROS、Model Zoo、Studio、XBurn、OE、X5 SDK）。
- `search_docs` 对「烧录」「PoE」「XBurn」能返回带 `title` / `url` / `manual` 的命中；URL 可在浏览器打开。
- `get_page` 对 Docusaurus 手册页返回可读 Markdown（含标题和正文），不是整页 HTML。
- `list_toc` 能列出一本手册的页面清单。
- 存在一条 Skill，description 含 RDK / TROS / Model Zoo / OE 等触发词，且规定「先 search 再 get_page」。
- `plugin.json` + `mcp.json` 齐备；`~/.cursor/plugins/local/rdk-docs` 可 symlink 本仓库。

## Non-goals

- 不做登录、评论、意见反馈。
- 不做全文向量库 / Embedding 检索。
- 不镜像整站离线文档。
- 不改资料中心网站本身。
- 第一期不做英文站点专线（`/en`）；中文站为主，英文 URL 仍可用 `get_page` 打开。
- 不镜像整本 Rspress 站点；只消费它自己生成的 `search_index.{lang}.{hash}.json`，哈希从首页 JS 发现，不写死。

## 外部事实（已核验，2026-08-21）

门户：<https://developer.d-robotics.cc/rdk_doc_center/>（Docusaurus 3.8.1）

| id | 手册 | 首页 | 索引 |
|----|------|------|------|
| rdk-x | RDK X 系列 | `/rdk_x_doc/RDK` | Docusaurus `search-index.json` |
| rdk-s | RDK S 系列 | `/rdk_s_doc/RDK` | 同上 |
| tros | TogetheROS.Bot | `/tros_doc/tros` | 同上 |
| model-zoo | Model Zoo | `/model_zoo_doc/model_zoo_intro` | 同上 |
| case-s600 | RDK S600 应用案例 | `/case_doc/case` | 同上 |
| magicbox | RDK Magicbox | `/magicbox_doc/magicbox` | 同上 |
| stereo-camera | 双目摄像头 | `/accessories_stereo_camera_doc/overview` | 同上 |
| bmi088 | BMI088 IMU | `/accessories_bmi088_doc/introduction` | 同上 |
| rdk-studio | RDK Studio | `/rdk_studio_doc/category/1-product-intro` | 同上 |
| xburn | XBurn | `/xburn_doc/overview` | 同上 |
| oe-s | S 系列 OE | `/oe_s_doc/index.html` | Rspress `static/search_index.{lang}.{hash}.json`（哈希从首页 JS 发现） |
| oe-llm-s100 | S100 OE LLM | `/oe_llm_s100p_doc/index.html` | 同上（`search_index.latest.{lang}.{hash}.json`） |
| oe-llm-s600 | S600 OE LLM | `/oe_llm_s600_doc/index.html` | 同上 |
| oe-x5 | X5 OE | `/oe_x5_doc/cn/index.html` | Sphinx `cn/searchindex.js` |
| oe-x3 | X3 OE | `/oe_x3_doc/cn/index.html` | Sphinx `cn/searchindex.js` |
| x5-sdk | X5 芯片 SDK | `/x5_sdk_doc/` | Sphinx `searchindex.js` |

Docusaurus `search-index.json` 是数组：第 0 段页面（`t/u/b`），后续段标题/摘要/正文片段。用这些字段做关键词检索即可，不必解析 lunr `index`。

## 工具契约

4 个 MCP tools，不多不少。

### `list_manuals`

无参数。返回手册数组：`id`, `title`, `category`, `homeUrl`, `searchable`，末尾带社区源 `forum`。

### `search_docs`

| 字段 | 类型 | 说明 |
|------|------|------|
| `query` | string | 必填，中英文关键词 |
| `manual` | string | 可选，手册 `id` 或别名（`x5`/`s100`/`tros`/`studio`/`forum`…） |
| `source` | string | 可选，`docs` / `forum` / `all`（默认）。`manual=forum` 等于只搜论坛 |
| `limit` | number | 可选，默认 8，最大 20 |

返回命中：`title`, `url`, `manual`, `snippet`, `score`, `source`（`docs` 或 `forum`）。默认两边都搜，手册约占 2/3 名额。同一 URL 去重。无索引或索引加载失败时在 `warnings` 里点名。论坛走 Discourse 公开 `search.json`，不镜像整站。

### `get_page`

| 字段 | 类型 | 说明 |
|------|------|------|
| `url` | string | 必填，资料中心文档 URL/路径，或论坛主题 URL |
| `maxChars` | number | 可选，默认 16000 |

返回 `title`, `url`, `markdown`。只接受 `developer.d-robotics.cc` 和 `forum.d-robotics.cc`。手册页抽取 `.theme-doc-markdown` / `article` / `.document` / `main`；Rspress CSR 空壳改从 `search_index` 还原；论坛主题拉 `/t/{id}.json`，把 cooked HTML 收成 Markdown。

### `list_toc`

| 字段 | 类型 | 说明 |
|------|------|------|
| `manual` | string | 必填，手册 id 或别名 |
| `query` | string | 可选，过滤标题 |

返回该手册页面：`title`, `url`, `breadcrumbs?`。

## 缓存与边界

- 索引缓存到 `RDK_DOCS_CACHE_DIR` 或 `~/.cache/rdk-docs-mcp`，TTL 默认 24h，可用 `RDK_DOCS_CACHE_TTL_MS` 覆盖（`0` 表示不读缓存）。论坛 `search.json` 最长缓存 15 分钟，主题 JSON 最长 1 小时。
- 论坛只消费 Discourse 公开 JSON，不镜像、不登录、不爬全站。
- 网络失败返回结构化错误，不抛崩 MCP。
- stdio 日志只写 stderr。
- 超时：单次 HTTP 15s。

## 验证

- 单测：catalog、Docusaurus/Sphinx fixture 检索、HTML→Markdown、URL 白名单。
- 联网冒烟（可选）：`search_docs query=PoE` 命中 `rdk_x_doc` 下真实 URL。
- 本地：`npm test` 全绿；`node mcp/dist/index.js` 能以 stdio 启动。
