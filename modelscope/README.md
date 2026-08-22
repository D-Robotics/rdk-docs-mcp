# RDK Docs

检索地瓜机器人（D-Robotics）官方手册和社区论坛，给 Agent 用的 MCP 服务。

手册是规范，论坛只作补充参考。回答以官方文档为准，并带可点击原文链接。

## 能做什么

| 工具 | 作用 |
|------|------|
| `list_manuals` | 列出资料中心全部手册 |
| `search_docs` | 只搜官方手册。指定手册只搜那一本 |
| `get_page` | 打开手册页，返回 Markdown |
| `list_toc` | 列一本手册的目录 |

社区经验不走上述工具，直接 GET `https://forum.d-robotics.cc/search.json?q=`。

## 覆盖范围

**16 本官方手册**（均可搜索，括号内为常用别名）

- RDK X 系列（`x5` / `x3`）· RDK S 系列（`s100` / `s600`）
- TogetheROS.Bot（`tros`）· Model Zoo（`zoo`）· S600 应用案例
- RDK Magicbox · 双目摄像头 · BMI088 IMU 模组
- RDK Studio（`studio`）· XBurn 烧录工具（`xburn`）
- OE 工具链：S 系列（`oe-s`）/ S100 LLM / S600 LLM / X5（`oe-x5`）/ X3（`oe-x3`）
- X5 芯片 SDK（`sdk`）

**社区论坛**（`forum`）：Discourse 公开 JSON，补充手册未覆盖的实操问题。不是官方规范。

## 在客户端里怎么用

给 Agent 复制这一句即可（MCP + Skill 一起装）：

```text
根据 https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/install.md 安装 RDK 文档检索。
```

或在客户端 MCP 设置里加：

```json
{
  "mcpServers": {
    "rdk-docs": {
      "command": "npx",
      "args": ["-y", "rdk-docs-mcp@latest"]
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
- 双目摄像头怎么标定？
- X5 芯片 SDK 怎么搭建开发环境？

先 `search_docs`，再对手册命中调用 `get_page`。手册已经能回答时不要展开论坛。手册和论坛冲突时只采用手册说法。

## 数据来源

- 手册：https://developer.d-robotics.cc/rdk_doc_center/
- 论坛：https://forum.d-robotics.cc/（Discourse 公开 JSON：全站搜索 + 开发与问题 / 通用最近帖）

不镜像整站，不写入文档或论坛。旧版资料 `https://developer.d-robotics.cc/information` 不在索引里。

## 源码

https://github.com/QiaolongLi1201/rdk-docs

npm：`rdk-docs-mcp`

## 许可

MIT。文档与帖子版权归原站。
