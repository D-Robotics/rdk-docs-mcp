---
name: rdk-docs
description: Retrieves official D-Robotics RDK documentation from developer.d-robotics.cc. Forum posts are optional supplement only. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, or any d-robotics developer docs.
---

# RDK 资料中心 + 社区论坛

手册走 MCP。社区经验走论坛公开的 Discourse JSON。两件事分开，不要混成「文档连接器的论坛索引」。

不要向用户汇报「论坛索引不可用 / 社区目录未加载 / 未知索引」。论坛本来就不在 MCP 手册目录里。也不要改用通用网页搜索。

## 手册（MCP）

| Tool | 用途 |
|------|------|
| `list_manuals` | 手册目录。只有官方手册，没有 forum |
| `search_docs` | 只搜手册。指定手册 id 更准 |
| `get_page` | 打开手册 URL |
| `list_toc` | 一本手册的目录 |

1. 识别产品：X3/X5 → `rdk-x` / `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录 → `xburn`；Studio → `studio`。
2. `search_docs`，查询词用用户中文原词，必要时再补英文。
3. 有 `role=official-start` 就先 `get_page` 打开它。若正文以「空壳页」开头，立刻改开下一条 `related`，不要对用户说「手册没写」。
4. 问句点名 X3 / X5 / S100 / S600 时，不要用另一型号的专题页当答案。
5. 规格（几路 USB、供电、算力、接口编号）优先硬件简介或手册首页，不要先开烧录 / 网络配置 / 驱动指南。
6. 手册能回答的部分以手册为准，带可点击链接。
7. S 系列 OE / OE LLM 是 Rspress 空壳，`get_page` 会从站点 `search_index` 还原正文。

## 社区经验（Discourse JSON）

用户问「有没有开发者经验 / 社区怎么说」或手册没写时，直接 GET 下面的 JSON。无需 Token。只打 `.json`，不要打开论坛 HTML，不要用 Web Search。

### 搜索

```
GET https://forum.d-robotics.cc/search.json?q=<URL 编码后的用户原词>
```

读 `topics[]` 的 `id`、`title`、`slug`；用 `posts[]` 里相同 `topic_id` 的 `blurb` 当摘要。不要把 `users` / `categories` 当结果。

### 读帖（最多 3 篇）

```
GET https://forum.d-robotics.cc/t/{id}.json
```

读 `title`、`post_stream.posts[].username` 和 `cooked`。`cooked` 剥标签当正文。引用写成 `https://forum.d-robotics.cc/t/{slug}/{id}`（slug 缺了用 `topic`），并标明「社区经验，非正式文档」。

### 看板块最近帖（可选）

- 开发与问题：`https://forum.d-robotics.cc/c/kai-fa-yu-wen-ti/39/l/latest.json`
- 通用：`https://forum.d-robotics.cc/c/general/4/l/latest.json`

读 `topic_list.topics[]`。跳过置顶介绍帖。

手册和论坛冲突时只采用手册。论坛不要和手册步骤并列成官方规定。

## 禁区

- 不要用 `get_page` / `search_docs` / `list_toc` 去找论坛，也不要在 `list_manuals` 里找 `forum`。
- 不要网页搜索、不要爬 `forum.d-robotics.cc` 的 HTML。
- 不要一次读超过 3 篇帖。
- 旧版资料：`https://developer.d-robotics.cc/information`，用 `get_page` 打开，不要假装已索引。
