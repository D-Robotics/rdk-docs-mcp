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
