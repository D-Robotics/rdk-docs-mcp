---
name: rdk-docs
description: Retrieves D-Robotics RDK documentation from developer.d-robotics.cc. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, or any d-robotics developer docs.
---

# RDK 资料中心

查阅文档时走 MCP，不要用训练记忆代替手册。

## 工具

| 顺序 | Tool | 用途 |
|------|------|------|
| 1 | `list_manuals` | 不知道该查哪本手册时先看目录 |
| 2 | `search_docs` | 按关键词检索。能确定手册就传 `manual` |
| 3 | `get_page` | 打开命中 URL，读正文 |
| 4 | `list_toc` | 搜索太散、或手册没有索引（`oe-s` / `oe-llm-*`）时列目录 |

## 流程

1. 从问题里识别产品：X3/X5 → `rdk-x` 或别名 `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录工具 → `xburn`；Studio → `studio`。
2. 先 `search_docs`。查询词用用户的中文原词，必要时再补英文（flash / PoE / YOLO）。
3. 打开 1–2 个最相关 URL 的 `get_page`，用手册原文回答。
4. 回答必须带可点击的文档链接。写不清就说手册里没写，不要编版本号或命令。
5. `oe-s`、`oe-llm-s100`、`oe-llm-s600` 没有公开搜索索引：`list_toc` 只会回到首页，接着 `get_page` 首页，再跟页内链接继续拉。

## 禁区

- 不要用 `get_page` 打开非 `developer.d-robotics.cc` 的地址。
- 不要一次拉超过 3 篇长文；先搜再精读。
- 旧版资料在 `https://developer.d-robotics.cc/information`，不在这套索引里。需要时用 `get_page` 打开该页，不要假装已索引。
