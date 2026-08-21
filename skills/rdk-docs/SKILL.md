---
name: rdk-docs
description: Retrieves D-Robotics RDK documentation and community forum posts from developer.d-robotics.cc and forum.d-robotics.cc. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, 论坛, or any d-robotics developer docs.
---

# RDK 资料中心 + 社区论坛

查阅文档和社区经验时走 MCP，不要用训练记忆代替手册或帖子。

## 工具

| 顺序 | Tool | 用途 |
|------|------|------|
| 1 | `list_manuals` | 不知道该查哪本手册时先看目录（含 `forum`） |
| 2 | `search_docs` | 按关键词检索。默认手册 + 论坛一起搜 |
| 3 | `get_page` | 打开命中 URL，读手册页或论坛主题 |
| 4 | `list_toc` | 搜索太散时列某一本手册的页面目录 |

## 流程

1. 从问题里识别产品：X3/X5 → `rdk-x` 或别名 `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录工具 → `xburn`；Studio → `studio`。
2. 先 `search_docs`。查询词用用户的中文原词，必要时再补英文（flash / PoE / YOLO）。默认会同时搜手册和论坛。
3. 打开 1–2 个最相关 URL 的 `get_page`。手册和论坛各开一篇往往比连开两篇手册更有用。
4. 回答必须带可点击链接。手册没写、论坛也没写，就说没写，不要编版本号或命令。
5. S 系列 OE / S100·S600 OE LLM（`oe-s`、`oe-llm-s100`、`oe-llm-s600`）按普通手册搜即可。它们是 Rspress CSR，页面 HTML 是空壳，`get_page` 会从站点自带的 `search_index` 还原正文。
6. 只查手册时传 `source: "docs"`；只查社区时传 `manual: "forum"` 或 `source: "forum"`。

## 手册 vs 论坛

- **手册是规范**：步骤、接口、版本以 `developer.d-robotics.cc` 为准。
- **论坛是经验**：报错、兼容性、别人踩过的坑。引用时标明来自社区帖，不要把个别回复写成官方规定。
- 两者冲突时，先写手册说法，再补充论坛里的实际做法和帖子链接。

## 禁区

- 不要用 `get_page` 打开除 `developer.d-robotics.cc` / `forum.d-robotics.cc` 以外的地址。
- 不要一次拉超过 3 篇长文；先搜再精读。
- 旧版资料在 `https://developer.d-robotics.cc/information`，不在这套索引里。需要时用 `get_page` 打开该页，不要假装已索引。
