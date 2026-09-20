---
name: rdk-docs
description: Retrieves official D-Robotics RDK documentation from developer.d-robotics.cc. Forum posts are optional supplement only. Use when the user asks about RDK X3/X5/S100/S600, TogetheROS/TROS, Model Zoo, OE toolchain, XBurn, RDK Studio, Magicbox, 双目摄像头, BMI088, 烧录, 量化, or any d-robotics developer docs.
---

# RDK 资料中心 + 社区论坛

所有检索都走 MCP。默认 `search_docs` 只查官方手册；用户明确要求社区/论坛经验时才使用 `source=forum` 或 `source=all`。`manual=forum` 保持兼容并等同于 `source=forum`。论坛结果是非正式证据，不能替代官方手册。

不要向用户汇报「论坛索引不可用 / 社区目录未加载 / 未知索引」。论坛本来就不在 MCP 手册目录里。也不要改用通用网页搜索。

## 手册（MCP）

| Tool | 用途 |
|------|------|
| `list_manuals` | 手册目录。只有官方手册，没有 forum |
| `search_docs` | 官方手册；显式给 `source=forum` / `source=all` 时含社区帖。指定手册 id 更准 |
| `get_page` | 打开 `search_docs` 返回的 URL：手册页或公开论坛帖 |
| `list_toc` | 一本手册的目录 |

1. 识别产品：X3/X5 → `rdk-x` / `x5`；S100/S600 → `rdk-s`；TROS → `tros`；烧录 → `xburn`；Studio → `studio`。
2. `search_docs`，查询词用用户中文原词，必要时再补英文。
3. 有 `role=official-start` 就先 `get_page` 打开它。若正文以「空壳页」开头，立刻改开下一条 `related`，不要对用户说「手册没写」。
4. 问句点名 X3 / X5 / S100 / S600 时，跨型号分开检索，不要用另一型号的专题页当答案。
5. 保留检索结果中的版本标签；缺少型号、系统版本或其他决定性参数时，先向用户澄清。
6. 证据不足时明确说明无法确认，不得推断支持或不支持。
7. 规格（几路 USB、供电、算力、接口编号）优先硬件简介或手册首页，不要先开烧录 / 网络配置 / 驱动指南。
8. 手册能回答的部分以手册为准，带可点击链接。
9. S 系列 OE / OE LLM 是 Rspress 空壳，`get_page` 会从站点 `search_index` 还原正文。

## 社区经验（MCP 优先）

用户明确要「开发者经验 / 社区怎么说」，或手册确实没写时：

1. 先用 `search_docs`：只要社区就 `source=forum`，手册为主、论坛补充就 `source=all`。
2. 对选中的论坛帖 URL 调 `get_page`（最多 3 篇）。引用写成 `https://forum.d-robotics.cc/t/{slug}/{id}`（slug 缺了用 `topic`），并标明「社区经验，非正式文档」。

只有 MCP 论坛检索失败或 0 命中时，才直接 GET Discourse JSON 兜底（无需 Token；只打 `.json`，不要打开论坛 HTML）：

```
GET https://forum.d-robotics.cc/search.json?q=<URL 编码后的用户原词>
GET https://forum.d-robotics.cc/t/{id}.json
```

读 `topics[]` 的 `id`、`title`、`slug`，用相同 `topic_id` 的 `blurb` 当摘要；读帖读 `title`、`post_stream.posts[].username` 和 `cooked`，`cooked` 剥标签当正文。不要把 `users` / `categories` 当结果。

手册和论坛冲突时只采用手册。论坛不要和手册步骤并列成官方规定。

## 图片、长页与内容冲突（证据规则）

- **含图的信息不算已读。** 管脚定义这类页面把完整表格放在图片里：`get_page` 返回 `truncated=false` 的完整 Markdown，也不代表正文里有逐针参数。涉及引脚定义 / 电平 / 电源时，必须打开或向用户展示页面里的官方图片（如 40PIN 管脚图），禁止拿其他型号的针脚表推断本型号。
- **长页先看 `truncated` 字段。** `truncated=true` 表示正文被截断（末尾有截断提示）；需要后文就用更大的 `maxChars` 重读（上限 40000）。到了上限仍不完整，就明确说明「该页过长，以下是部分内容」，不要装作已经读全。
- **官方页面之间的数值冲突不要自行裁决。** 例：RDK X5 的 40PIN 电源负载，硬件简介页写 1A @3.3V / 1A @5V，管脚定义页写 800mA @3.3V / 500mA @5V。遇到就把两处原文连同链接一起列出，说明官方文档暂不一致、以文档维护者的确认为准；不得替用户下兼容性结论，也不要默选其中一个值。

## 禁区

- 不要在 `list_manuals` 里找 `forum`——论坛不在手册目录里。
- 不要网页搜索、不要爬 `forum.d-robotics.cc` 的 HTML。
- 不要一次读超过 3 篇帖。
- 旧版资料：`https://developer.d-robotics.cc/information`，用 `get_page` 打开，不要假装已索引。
