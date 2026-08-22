---
name: rdk-docs
description: Retrieves official D-Robotics RDK documentation from developer.d-robotics.cc. Forum posts are optional supplement only. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, or any d-robotics developer docs.
---

# RDK 资料中心 + 社区论坛

查阅官方手册时走 MCP，不要用训练记忆代替原文。论坛只作补充，走站点公开的 Discourse JSON，不要抓网页 HTML。

## 工具（手册）

| 顺序 | Tool | 用途 |
|------|------|------|
| 1 | `list_manuals` | 不知道该查哪本手册时先看目录 |
| 2 | `search_docs` | 搜手册。指定手册只搜那一本 |
| 3 | `get_page` | 打开手册页。Rspress 空壳会从站点 `search_index` 还原 |
| 4 | `list_toc` | 列一本手册的目录 |

`list_manuals` 里的 `forum` 没有手册 `search-index.json`，这是正常的（`indexKind=discourse`）。不要说「社区目录未加载 / 未知索引」，不要暂停。社区检索用下面的 JSON，或等价的 MCP 论坛工具。

## 流程

1. 从问题里识别产品：X3/X5 → `rdk-x` 或别名 `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录工具 → `xburn`；Studio → `studio`。
2. 先 `search_docs` 搜手册，优先带上手册 id。查询词用用户的中文原词，必要时再补英文（flash / PoE / YOLO）。
3. 返回里若有 `role=official-start`，先 `get_page` 打开这一条。不要先开 related 或论坛。
4. 手册已经能回答时，不要再开论坛、也不要在答案里并列一篇社区帖。
5. 只有手册没写、对不上版本，或用户明确问社区怎么说时，再查论坛（下一节）。不要为了论坛去 `search_docs` 全库，那会先拉齐手册索引。
6. 回答必须带可点击链接。以手册步骤、接口、版本为准。手册没写、论坛也没写，就说没写，不要编。
7. S 系列 OE / S100·S600 OE LLM（`oe-s`、`oe-llm-s100`、`oe-llm-s600`）按普通手册搜即可。它们是 Rspress CSR，页面 HTML 是空壳，`get_page` 会从站点自带的 `search_index` 还原正文。

## 论坛：公开 Discourse JSON

无需 Token、无需登录。只 GET 带 `.json` 的地址，或给同一路径加 `Accept: application/json`。**不要**打开 `/t/...`、`/c/...`、首页的 HTML，也不要 WebFetch 论坛网页。

引用链接一律写成可点的主题页：`https://forum.d-robotics.cc/t/{slug}/{id}`（slug 缺省时用 `topic`）。最多打开 3 个主题。引用时标明「社区经验，非正式文档」。

### 1. 搜索

```
GET https://forum.d-robotics.cc/search.json?q=<URL 编码后的用户原词>
```

读：

- `topics[]`：`id`、`title`、`slug`、`tags`
- `posts[]`：`topic_id`、`username`、`blurb`（摘要，按 `topic_id` 对齐到主题）

先看 `topics` 标题，再用对应 `posts.blurb` 判断是否相关。不要把 `users` / `categories` 当结果。

### 2. 读帖

```
GET https://forum.d-robotics.cc/t/{id}.json
```

读 `title`、`tags`、`post_stream.posts[]` 的 `username` 与 `cooked`。`cooked` 是 HTML 片段：剥标签当正文即可，不要再请求同 id 的网页。

### 3. 板块最近帖

| 板块 | JSON |
|------|------|
| 开发与问题 | `https://forum.d-robotics.cc/c/kai-fa-yu-wen-ti/39/l/latest.json` |
| 通用 | `https://forum.d-robotics.cc/c/general/4/l/latest.json` |

读 `topic_list.topics[]` 的 `id`、`title`、`slug`、`excerpt`。跳过置顶且标题像「关于…类别 / 欢迎来到」的介绍帖。

其它板块：从用户给的 `/c/.../{id}` 取出最后那个数字，请求 `https://forum.d-robotics.cc/c/{id}/l/latest.json`。

### 和 MCP 的关系

`search_docs(source=forum)` / `list_toc(manual=forum)` / `get_page(论坛 URL)` 封装的就是上面三个 JSON。MCP 在且你已经在用它时，两者等效，不必重复打。MCP 不在、或你只想补社区帖时，直接打 JSON 更快。

## 手册 vs 论坛

- **手册是规范**：步骤、接口、版本以 `developer.d-robotics.cc` 为准。答案主体必须来自手册。
- **论坛是补充**：报错、兼容性、别人踩过的坑。不要把个别回复写成官方规定。
- 两者冲突时只采用手册说法；论坛最多作为「有人这样处理过」附在后面。

## 禁区

- 手册只用 MCP 打开 `developer.d-robotics.cc`。不要用 `get_page` 打开这两个站以外的地址。
- 论坛只打上面的 JSON。不要爬论坛 HTML，不要假装 `forum` 是一本带 `search-index.json` 的手册。
- 不要一次拉超过 3 篇长文；先搜再精读。
- 旧版资料在 `https://developer.d-robotics.cc/information`，不在手册索引里。需要时用 `get_page` 打开该页，不要假装已索引。
