# rdk-docs-mcp

检索 [D-Robotics 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 与 [社区论坛](https://forum.d-robotics.cc/)，并在 [D-Robotics/rdk-skills](https://github.com/D-Robotics/rdk-skills) 目录里发现 Skill（只读）的 MCP Server。共六个工具：`list_manuals`、`search_docs`、`get_page`、`list_toc`、`search_skills`、`get_skill`。

给 Agent 这一句：

```text
根据 https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/install.md 安装 RDK 文档检索。
```

或本机直接：

```bash
npx -y rdk-docs-mcp@latest --install
```

需要 Node.js 20+。无需登录、无需 API Key。

`search_docs` 用 BM25（标题和路径权重大于正文，中文按二字切分）。可选 `alt_queries`（最多 3 条，每条不超过 300 字，更长的会丢掉并写进 `warnings`，搜索仍继续）：调用方在用户口语化或贴了报错日志时，改写成文档用词；服务端按页面做 RRF 合并，不传则与单次查询相同。可多传 `board`（`x3` | `x5` | `s100` | `s600`）。问句或 `board` 点名 X3/X5 时会丢掉 S 系列手册，点名 S100/S600 时会丢掉 X 系列手册；同一本手册里对不上型号的页也会丢掉。问句和 `board` 都没指定板卡时，`ambiguousBoard=true`，命中按相关度排序，`groups` 仍按板卡分开；不要把 `hits[0]` 当成用户的板卡。在板子上的 Agent（包括 Moss）应传入检测到的板卡。每条命中带参考用的 `confidence`（0–1）。`noGoodMatch=true` 只在问句里的包名、命令、API 或错误码既不在所搜手册里、也不在顶部命中里时出现。没有这个标记不代表命中一定相关；摘要答不上就换问法、补 `board`，或 `source=forum`。`get_page` 默认只返回最相关的几节（带标题和页面 URL，约 6000 字）；传入 `query` 时按问句挑节。问句对不上任何一节时，改用 BM25 在该页各节上重排；仍然没有命中则只返回节标题索引，方便再点名某一节。被省略的节写在末尾：`… omitted sections: <headings>`。传入 `full=true` 才返回整页。也可传 `section`，或在 URL 上带 `#anchor`。不传 `maxChars` 时节选大约 6000 字；显式传入则按该值返回，最大 40000，不必设 `full`。`imageOnly=true` 表示该节只有图片。冷启动读包内 `prebuilt/` 文档快照和 `.bm25.gz` 倒排表。快照超过 14 天会改拉线上索引并警告；设 `RDK_DOCS_PREBUILT=0` 则总是在线拉索引。发布前 `prepublishOnly` 会执行 `npm run build:index` 重建快照和倒排表。
