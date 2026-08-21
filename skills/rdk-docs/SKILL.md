---
name: rdk-docs
description: Retrieves official D-Robotics RDK documentation from developer.d-robotics.cc. Forum posts are optional supplement only. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, or any d-robotics developer docs.
---

# RDK 资料中心 + 社区论坛

查阅官方手册时走 MCP，不要用训练记忆代替原文。论坛只作补充，不能压过手册。

## 工具

| 顺序 | Tool | 用途 |
|------|------|------|
| 1 | `list_manuals` | 不知道该查哪本手册时先看目录 |
| 2 | `search_docs` | 先搜手册。指定手册只搜那一本；不指定时手册为主、论坛至多作补充 |
| 3 | `get_page` | 打开命中 URL。优先打开手册页 |
| 4 | `list_toc` | 列手册目录；只要用户明确要社区帖，才用 `manual=forum` |

## 流程

1. 从问题里识别产品：X3/X5 → `rdk-x` 或别名 `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录工具 → `xburn`；Studio → `studio`。
2. 先 `search_docs`，优先带上手册 id。查询词用用户的中文原词，必要时再补英文（flash / PoE / YOLO）。
3. 返回里若有 `role=official-start`，先 `get_page` 打开这一条，这是官方推荐入口。不要先开 related 或论坛。
4. 手册已经能回答时，不要再开论坛、也不要在答案里并列一篇社区帖。
5. 只有手册没写、对不上版本，或用户明确问社区怎么说时，再 `source: "forum"` / `list_toc(manual=forum)`，或 `get_page` 打开 `forum.d-robotics.cc` 首页/板块 `/c/.../{id}`。不要 WebFetch 论坛 HTML。
6. 回答必须带可点击链接。以手册步骤、接口、版本为准。手册没写、论坛也没写，就说没写，不要编。
7. S 系列 OE / S100·S600 OE LLM（`oe-s`、`oe-llm-s100`、`oe-llm-s600`）按普通手册搜即可。它们是 Rspress CSR，页面 HTML 是空壳，`get_page` 会从站点自带的 `search_index` 还原正文。

## 手册 vs 论坛

- **手册是规范**：步骤、接口、版本以 `developer.d-robotics.cc` 为准。答案主体必须来自手册。
- **论坛是补充**：报错、兼容性、别人踩过的坑。引用时标明「社区经验，非正式文档」，不要把个别回复写成官方规定。
- 两者冲突时只采用手册说法；论坛最多作为「有人这样处理过」附在后面。

## 禁区

- 不要用 `get_page` 打开除 `developer.d-robotics.cc` / `forum.d-robotics.cc` 以外的地址。
- 不要 WebFetch / 爬论坛 HTML。论坛有 Discourse JSON：`search_docs`、`list_toc(manual=forum)`、`get_page(帖子 URL)`。
- 不要一次拉超过 3 篇长文；先搜再精读。
- 旧版资料在 `https://developer.d-robotics.cc/information`，不在这套索引里。需要时用 `get_page` 打开该页，不要假装已索引。
