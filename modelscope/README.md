# RDK Docs

检索地瓜机器人（D-Robotics）官方手册和社区论坛，给 Agent 用的 MCP 服务。

手册是规范，论坛是经验。默认两边一起搜，回答里带可点击原文链接。

## 能做什么

| 工具 | 作用 |
|------|------|
| `list_manuals` | 列出资料中心手册，以及社区源 `forum` |
| `search_docs` | 中英文检索。默认手册 + 论坛。`source` 可选 `docs` / `forum` / `all` |
| `get_page` | 打开手册页或论坛主题，返回 Markdown |
| `list_toc` | 列出某一本手册的页面目录 |

覆盖 RDK X3/X5/S100/S600、TogetheROS、Model Zoo、OE 工具链、XBurn、RDK Studio、S 系列 OE / OE LLM 等。

## 在客户端里怎么用

Cursor / Claude / 通义灵码 / Cherry Studio 等，把下面配置加到 MCP 设置：

```json
{
  "mcpServers": {
    "rdk-docs": {
      "command": "npx",
      "args": ["-y", "rdk-docs-mcp"]
    }
  }
}
```

需要本机 Node.js 20+。不需要 Token。

## 推荐问法

- RDK X5 怎么把系统烧到 SD 卡？
- S100 没有 Wi-Fi 图标，论坛里怎么说？
- X5 OE 怎么做量化？
- TogetheROS.Bot 怎么安装？

先 `search_docs`，再对 1–2 个命中调用 `get_page`。手册和论坛冲突时，以手册为准，论坛当经验并附帖子链接。

## 数据来源

- 手册：https://developer.d-robotics.cc/rdk_doc_center/
- 论坛：https://forum.d-robotics.cc/（Discourse 公开搜索 API）

不镜像整站，不写入文档或论坛。旧版资料 `https://developer.d-robotics.cc/information` 不在索引里。

## 源码

https://github.com/QiaolongLi1201/rdk-docs

npm：`rdk-docs-mcp`

## 许可

MIT。文档与帖子版权归原站。
