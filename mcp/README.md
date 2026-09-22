# RDK Assistant MCP

检索 [D-Robotics 资料中心](https://developer.d-robotics.cc/rdk_doc_center/) 与 [社区论坛](https://forum.d-robotics.cc/)，并在 [D-Robotics/rdk-skills](https://github.com/D-Robotics/rdk-skills) 目录里发现 Skill（只读）的 MCP Server。共七个工具：`get_status`、`list_manuals`、`search_docs`、`get_page`、`list_toc`、`search_skills`、`get_skill`。

给 Agent 这一句：

```text
根据 https://cdn.jsdelivr.net/npm/rdk-docs-mcp@latest/install.md 安装 RDK 文档检索。
```

或本机直接：

```bash
npx -y rdk-docs-mcp@latest --install
```

需要 Node.js 20+。无需登录、无需 API Key。


显示名称为 RDK Assistant MCP，npm 包及命令仍为 `rdk-docs-mcp`，配置 id 仍为 `rdk-docs`。

```bash
npx -y rdk-docs-mcp@latest --doctor
npx -y rdk-docs-mcp@latest --doctor --check-catalog
```

`--doctor` 输出该进程的版本和能力，不刷新已安装 Skill；`--check-catalog` 额外检查目录并可能更新只读目录缓存。它不能代表另一条固定路径配置启动的版本，已连接客户端应调用 `get_status` 核对。

Skill 搜索支持任务、角色、板卡和流程约束，返回分类覆盖及相关性状态；`get_skill(include_content=true)` 可读取目录版本对应的正文。`get_page` 和 Skill 正文续读使用返回的 `next_offset`、`content_hash`，下一次传入 `offset`、`expected_content_hash`。正文变化需从头读取。
